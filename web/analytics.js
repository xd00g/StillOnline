'use strict';
(() => {
  if (location.hostname !== 'mojave.nebulys.net' || navigator.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  try { if (localStorage.getItem('doogster-stats-ignore') === '1') return; } catch {}
  const stats=document.createElement('script');stats.defer=true;stats.src='/_stats/tracker.js';document.head.append(stats);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', 'G-43B8NLHN9S', {page_location:'https://mojave.nebulys.net/',allow_google_signals:false,allow_ad_personalization_signals:false});
  const script=document.createElement('script');script.async=true;
  script.src='https://www.googletagmanager.com/gtag/js?id=G-43B8NLHN9S';document.head.append(script);
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    const feature=button.dataset.open || (button.hasAttribute('data-sky')?'desert_sky':button.hasAttribute('data-restart')?'generator':button.id==='soundButton'?'sound':null);
    if(feature)gtag('event','explore_outpost',{feature});
  });
})();
