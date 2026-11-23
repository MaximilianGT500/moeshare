import{A as e,Ct as t,Ht as n,J as r,Jt as i,K as a,Lr as o,N as s,Pt as c,Ut as l,Vr as u,Wt as d,Yt as f,_t as p,q as m,st as h,wt as g,x as _,xt as v,zr as y}from"./chunk-Bt9wD2Ud.js";import{a as b,t as x}from"./chunk-C3k_fiO2.js";import{r as S}from"./chunk-vEuG5Mg6.js";import{p as C}from"./chunk-iMjofUjc.js";import{t as w}from"./chunk-Cm8dmKj2.js";import{i as T,r as E,t as D}from"./chunk-f3CR8sxH.js";function O(e){return String(e).match(/[\d.\-+]*\s*(.*)/)[1]||``}function k(e){return parseFloat(e)}var A=u(y(),1);function j(e){return l(`MuiSkeleton`,e)}n(`MuiSkeleton`,[`root`,`text`,`rectangular`,`rounded`,`circular`,`pulse`,`wave`,`withChildren`,`fitContent`,`heightAuto`]);var M=o(),N=e=>{let{classes:t,variant:n,animation:r,hasChildren:i,width:a,height:o}=e;return c({root:[`root`,n,r,i&&`withChildren`,i&&!a&&`fitContent`,i&&!o&&`heightAuto`]},j,t)},P=f`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
`,F=f`
  0% {
    transform: translateX(-100%);
  }

  50% {
    /* +0.5s of delay between each loop */
    transform: translateX(100%);
  }

  100% {
    transform: translateX(100%);
  }
`,I=typeof P==`string`?null:i`
        animation: ${P} 2s ease-in-out 0.5s infinite;
      `,L=typeof F==`string`?null:i`
        &::after {
          animation: ${F} 2s linear 0.5s infinite;
        }
      `,R=t(`span`,{name:`MuiSkeleton`,slot:`Root`,overridesResolver:(e,t)=>{let{ownerState:n}=e;return[t.root,t[n.variant],n.animation!==!1&&t[n.animation],n.hasChildren&&t.withChildren,n.hasChildren&&!n.width&&t.fitContent,n.hasChildren&&!n.height&&t.heightAuto]}})(p(({theme:e})=>{let t=O(e.shape.borderRadius)||`px`,n=k(e.shape.borderRadius),r=h(e,{animation:`none`}),i=h(e,{"&::after":{animation:`none`,display:`none`}});return{display:`block`,backgroundColor:e.vars?e.vars.palette.Skeleton.bg:e.alpha(e.palette.text.primary,e.palette.mode===`light`?.11:.13),height:`1.2em`,variants:[{props:{variant:`text`},style:{marginTop:0,marginBottom:0,height:`auto`,transformOrigin:`0 55%`,transform:`scale(1, 0.60)`,borderRadius:`${n}${t}/${Math.round(n/.6*10)/10}${t}`,"&:empty:before":{content:`"\\00a0"`}}},{props:{variant:`circular`},style:{borderRadius:`50%`}},{props:{variant:`rounded`},style:{borderRadius:(e.vars||e).shape.borderRadius}},{props:({ownerState:e})=>e.hasChildren,style:{"& > *":{visibility:`hidden`}}},{props:({ownerState:e})=>e.hasChildren&&!e.width,style:{maxWidth:`fit-content`}},{props:({ownerState:e})=>e.hasChildren&&!e.height,style:{height:`auto`}},{props:{animation:`pulse`},style:I||{animation:`${P} 2s ease-in-out 0.5s infinite`}},...r?[{props:{animation:`pulse`},style:r}]:[],{props:{animation:`wave`},style:{position:`relative`,overflow:`hidden`,WebkitMaskImage:`-webkit-radial-gradient(white, black)`,"&::after":{background:`linear-gradient(
                90deg,
                transparent,
                ${(e.vars||e).palette.action.hover},
                transparent
              )`,content:`""`,position:`absolute`,transform:`translateX(-100%)`,bottom:0,left:0,right:0,top:0}}},{props:{animation:`wave`},style:L||{"&::after":{animation:`${F} 2s linear 0.5s infinite`}}},...i?[{props:{animation:`wave`},style:i}]:[]]}})),z=A.forwardRef(function(e,t){let n=v({props:e,name:`MuiSkeleton`}),{animation:r=`pulse`,className:i,component:a=`span`,height:o,style:s,variant:c=`text`,width:l,...u}=n,f={...n,animation:r,component:a,variant:c,hasChildren:!!u.children},p=N(f);return(0,M.jsx)(R,{as:a,ref:t,className:d(p.root,i),ownerState:f,...u,style:{width:l,height:o,...s}})}),B=a((0,M.jsx)(`path`,{d:`M18 13h-5v5c0 .55-.45 1-1 1s-1-.45-1-1v-5H6c-.55 0-1-.45-1-1s.45-1 1-1h5V6c0-.55.45-1 1-1s1 .45 1 1v5h5c.55 0 1 .45 1 1s-.45 1-1 1`}),`AddRounded`);function V(e){return l(`MuiDialogContentText`,e)}n(`MuiDialogContentText`,[`root`]);var H=e=>{let{classes:t}=e,n=c({root:[`root`]},V,t);return{...t,...n}},U=t(e,{shouldForwardProp:e=>g(e)||e===`classes`,name:`MuiDialogContentText`,slot:`Root`})({}),W=A.forwardRef(function(e,t){let n=v({props:e,name:`MuiDialogContentText`}),{children:r,className:i,...a}=n,o=H(a);return(0,M.jsx)(U,{component:`p`,variant:`body1`,color:`textSecondary`,ref:t,ownerState:a,className:d(o.root,i),...n,classes:o})}),G=(0,A.createContext)(async()=>!1),K=()=>(0,A.useContext)(G);function q({children:e}){let[t,n]=(0,A.useState)(null),[i,a]=(0,A.useState)(!1),o=(0,A.useRef)(()=>{}),c=(0,A.useCallback)(e=>(n(e),a(!0),new Promise(e=>{o.current=e})),[]),l=e=>{a(!1),o.current(e)},u=t?.destructive??!0,d=t?.icon??(u?(0,M.jsx)(C,{}):null);return(0,M.jsxs)(G.Provider,{value:c,children:[e,(0,M.jsx)(w,{open:i,onClose:()=>l(!1),maxWidth:`xs`,fullWidth:!0,slots:{transition:D},"aria-labelledby":`confirm-title`,sx:{zIndex:1550},children:t&&(0,M.jsxs)(M.Fragment,{children:[d&&(0,M.jsx)(m,{sx:{display:`flex`,justifyContent:`center`,pt:2,color:u?r.error:r.secondary,"& svg":{fontSize:28}},children:d}),(0,M.jsx)(E,{id:`confirm-title`,sx:{textAlign:d?`center`:`left`},children:t.title}),(0,M.jsx)(T,{children:(0,M.jsx)(W,{component:`div`,sx:{textAlign:d?`center`:`left`,wordBreak:`break-word`},children:t.message})}),(0,M.jsxs)(b,{children:[(0,M.jsx)(s,{onClick:()=>l(!1),autoFocus:u,children:t.cancelLabel??_(`Abbrechen`)}),(0,M.jsx)(s,{variant:`contained`,color:u?`error`:`primary`,onClick:()=>l(!0),autoFocus:!u,children:t.confirmLabel??_(`Löschen`)})]})]})})]})}function J({value:e,onChange:t,label:n,children:r}){let i=S();return(0,M.jsx)(x,{value:e,onChange:(e,n)=>t(n),"aria-label":n,variant:`scrollable`,scrollButtons:!1,slotProps:{scroller:{ref:i.ref,onScroll:i.onScroll,style:i.style}},children:r})}var Y=a((0,M.jsx)(`path`,{d:`M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2M4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12m8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8`}),`BlockRounded`),X=a((0,M.jsx)(`path`,{d:`M13.26 3C8.17 2.86 4 6.95 4 12H2.21c-.45 0-.67.54-.35.85l2.79 2.8c.2.2.51.2.71 0l2.79-2.8c.31-.31.09-.85-.36-.85H6c0-3.9 3.18-7.05 7.1-7 3.72.05 6.85 3.18 6.9 6.9.05 3.91-3.1 7.1-7 7.1-1.61 0-3.1-.55-4.28-1.48-.4-.31-.96-.28-1.32.08-.42.42-.39 1.13.08 1.49C9 20.29 10.91 21 13 21c5.05 0 9.14-4.17 9-9.26-.13-4.69-4.05-8.61-8.74-8.74m-.51 5c-.41 0-.75.34-.75.75v3.68c0 .35.19.68.49.86l3.12 1.85c.36.21.82.09 1.03-.26.21-.36.09-.82-.26-1.03l-2.88-1.71v-3.4c0-.4-.34-.74-.75-.74`}),`HistoryRounded`);export{K as a,q as i,Y as n,B as o,J as r,z as s,X as t};