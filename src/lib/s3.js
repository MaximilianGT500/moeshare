'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');

const EMPTY_HASH = crypto.createHash('sha256').update('').digest('hex');
const UNSIGNED = 'UNSIGNED-PAYLOAD';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const encode = (text) => encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key) => key.split('/').map(encode).join('/');
const stamp = (date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

const decodeXml = (text) =>
  text.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (match, entity) => {
    const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }[entity.toLowerCase()];
    if (named) return named;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return String.fromCodePoint(code);
  });

const tagValue = (xml, tag) => {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1]) : null;
};

class S3Error extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'S3Error';
    this.status = status;
    this.code = code;
  }
}

function regionFromEndpoint(endpoint) {
  try {
    const host = new URL(endpoint).hostname;
    const backblaze = /^s3\.([a-z0-9-]+)\.backblazeb2\.com$/.exec(host);
    if (backblaze) return backblaze[1];
    const aws = /^s3[.-]([a-z0-9-]+)\.amazonaws\.com$/.exec(host);
    if (aws && aws[1] !== 'external-1') return aws[1];
    if (/\.r2\.cloudflarestorage\.com$/.test(host)) return 'auto';
  } catch {}
  return null;
}

class S3Client {
  constructor({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle = false,
    timeoutMs = 60000,
    now = () => new Date(),
  }) {
    if (!bucket) throw new S3Error('Für S3 fehlt der Bucket.');
    if (!accessKeyId || !secretAccessKey) throw new S3Error('Für S3 fehlen Access Key oder Secret Key.');
    const resolvedRegion = region || regionFromEndpoint(endpoint) || 'us-east-1';
    const url = new URL(endpoint || `https://s3.${resolvedRegion}.amazonaws.com`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new S3Error('Der S3-Endpunkt muss mit https:// oder http:// beginnen.');
    this.protocol = url.protocol;
    this.endpointHost = url.host;
    this.basePath = url.pathname.replace(/\/+$/, '');
    this.region = resolvedRegion;
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.forcePathStyle = Boolean(forcePathStyle);
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.transport = url.protocol === 'http:' ? http : https;
    this.agent = new this.transport.Agent({ keepAlive: true, maxSockets: 32 });
  }

  target(key = '') {
    if (this.forcePathStyle) {
      const path = key ? `${this.basePath}/${encode(this.bucket)}/${encodeKey(key)}` : `${this.basePath}/${encode(this.bucket)}`;
      return { host: this.endpointHost, path };
    }
    return { host: `${this.bucket}.${this.endpointHost}`, path: `${this.basePath}/${encodeKey(key)}` };
  }

  signingKey(date) {
    return hmac(hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, date), this.region), 's3'), 'aws4_request');
  }

  canonicalQuery(query) {
    return Object.keys(query)
      .map((name) => [encode(name), encode(String(query[name]))])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, value]) => `${name}=${value}`)
      .join('&');
  }

  sign({ method, key = '', query = {}, headers = {}, payloadHash }) {
    const { host, path } = this.target(key);
    const amzDate = stamp(this.now());
    const date = amzDate.slice(0, 8);
    const all = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
    for (const [name, value] of Object.entries(headers)) if (value !== undefined && value !== null) all[name.toLowerCase()] = String(value);
    const names = Object.keys(all).sort();
    const canonicalHeaders = names.map((name) => `${name}:${all[name].trim().replace(/\s+/g, ' ')}\n`).join('');
    const queryString = this.canonicalQuery(query);
    const request = [method, path, queryString, canonicalHeaders, names.join(';'), payloadHash].join('\n');
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(request)].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(date)).update(toSign).digest('hex');
    all.authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
    return { host, path, query: queryString, headers: all };
  }

  request(method, key, { query = {}, headers = {}, body = null, expect = [200], stream = false } = {}) {
    const streaming = body && typeof body.pipe === 'function';
    const payloadHash = body === null ? EMPTY_HASH : streaming ? UNSIGNED : sha256(body);
    const signed = this.sign({ method, key, query, headers, payloadHash });
    if (!streaming && body !== null) signed.headers['content-length'] = String(Buffer.byteLength(body));
    const [hostname, port] = signed.host.split(':');
    return new Promise((resolve, reject) => {
      const request = this.transport.request(
        {
          protocol: this.protocol,
          hostname,
          port: port ? Number(port) : undefined,
          method,
          path: signed.query ? `${signed.path}?${signed.query}` : signed.path,
          headers: signed.headers,
          agent: this.agent,
        },
        (response) => {
          if (stream && expect.includes(response.statusCode)) return resolve(response);
          const chunks = [];
          response.on('data', (chunk) => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            const text = Buffer.concat(chunks);
            if (expect.includes(response.statusCode))
              return resolve({ status: response.statusCode, headers: response.headers, body: text });
            const xml = text.toString('utf8');
            const code = tagValue(xml, 'Code');
            const message = tagValue(xml, 'Message');
            return reject(
              new S3Error(`S3 antwortet mit ${response.statusCode}${code ? ` ${code}` : ''}${message ? `: ${message}` : ''}`, {
                status: response.statusCode,
                code,
              })
            );
          });
          return undefined;
        }
      );
      request.setTimeout(this.timeoutMs, () =>
        request.destroy(new S3Error(`S3 hat nicht innerhalb von ${Math.round(this.timeoutMs / 1000)} Sekunden geantwortet.`))
      );
      request.on('error', (error) =>
        reject(error instanceof S3Error ? error : new S3Error(`S3 ist nicht erreichbar: ${error.message}`, { code: error.code }))
      );
      if (streaming) {
        body.on('error', (error) => request.destroy(error));
        body.pipe(request);
      } else {
        request.end(body === null ? undefined : body);
      }
    });
  }

  put(key, body, { contentType, contentLength, cacheControl, contentDisposition } = {}) {
    const headers = {
      'content-type': contentType || 'application/octet-stream',
      'cache-control': cacheControl,
      'content-disposition': contentDisposition,
    };
    if (body && typeof body.pipe === 'function') {
      if (!Number.isFinite(contentLength)) throw new S3Error('Für das Hochladen nach S3 fehlt die Dateigröße.');
      headers['content-length'] = contentLength;
    }
    return this.request('PUT', key, { headers, body });
  }

  get(key, { range } = {}) {
    return this.request('GET', key, { headers: { range }, expect: [200, 206], stream: true });
  }

  async head(key) {
    try {
      const response = await this.request('HEAD', key);
      return {
        size: Number(response.headers['content-length']) || 0,
        contentType: response.headers['content-type'] || null,
        etag: response.headers.etag || null,
      };
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  }

  async remove(key) {
    await this.request('DELETE', key, { expect: [200, 204, 404] });
  }

  async list(prefix = '', { token = null, max = 1000 } = {}) {
    const query = { 'list-type': '2', prefix, 'max-keys': String(max) };
    if (token) query['continuation-token'] = token;
    const { body } = await this.request('GET', '', { query });
    const xml = body.toString('utf8');
    const objects = [];
    for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      objects.push({
        key: tagValue(match[1], 'Key'),
        size: Number(tagValue(match[1], 'Size')) || 0,
        modified: Date.parse(tagValue(match[1], 'LastModified') || '') || null,
      });
    }
    const truncated = tagValue(xml, 'IsTruncated') === 'true';
    return { objects, next: truncated ? tagValue(xml, 'NextContinuationToken') : null };
  }

  async *listAll(prefix = '') {
    let token = null;
    do {
      const page = await this.list(prefix, { token });
      yield* page.objects;
      token = page.next;
    } while (token);
  }

  async removePrefix(prefix) {
    let removed = 0;
    const keys = [];
    for await (const object of this.listAll(prefix)) keys.push(object.key);
    for (let index = 0; index < keys.length; index += 8) {
      await Promise.all(keys.slice(index, index + 8).map((key) => this.remove(key)));
      removed += keys.slice(index, index + 8).length;
    }
    return removed;
  }

  presign(key, expiresSeconds = 900, extra = {}) {
    const { host, path } = this.target(key);
    const amzDate = stamp(this.now());
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${this.region}/s3/aws4_request`;
    const query = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${this.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.round(expiresSeconds)))),
      'X-Amz-SignedHeaders': 'host',
    };
    for (const [name, value] of Object.entries(extra)) if (value !== undefined && value !== null) query[name] = value;
    const queryString = this.canonicalQuery(query);
    const request = ['GET', path, queryString, `host:${host}\n`, 'host', UNSIGNED].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(request)].join('\n');
    const signature = crypto.createHmac('sha256', this.signingKey(date)).update(toSign).digest('hex');
    return `${this.protocol}//${host}${path}?${queryString}&X-Amz-Signature=${signature}`;
  }

  close() {
    this.agent.destroy();
  }
}

module.exports = { S3Client, S3Error, regionFromEndpoint };
