export function shareXConfig({ siteTitle, baseUrl, token }: { siteTitle: string; baseUrl: string; token: string }): string {
  const config = {
    Version: '17.0.0',
    Name: siteTitle || 'MoeShare',
    DestinationType: 'ImageUploader, TextUploader, FileUploader',
    RequestMethod: 'POST',
    RequestURL: `${baseUrl}/upload`,
    Headers: { Authorization: token },
    Body: 'MultipartFormData',
    FileFormName: 'file',
    URL: '{json:view}',
    ThumbnailURL: '{json:preview}',
    DeletionURL: '{json:delete}',
    ErrorMessage: '{json:error}',
  };
  return JSON.stringify(config, null, 2);
}

export function downloadText(filename: string, text: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const shareXFilename = (siteTitle: string) => `${(siteTitle || 'MoeShare').replace(/[^\w.-]+/g, '-')}.sxcu`;
