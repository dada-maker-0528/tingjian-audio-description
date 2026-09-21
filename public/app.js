const icons={plus:'<path d="M12 5v14M5 12h14"/>',volume:'<path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 010 8M18 5a10 10 0 010 14"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 014.8 1c0 2-2.3 2-2.3 4M12 17h.01"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',back:'<path d="M19 12H5m5-5-5 5 5 5"/>',play:'<path d="m8 5 11 7-11 7z"/>',check:'<path d="m5 12 4 4L19 6"/>',headphones:'<path d="M4 14v-3a8 8 0 0116 0v3M4 13h4v8H4zm12 0h4v8h-4z"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',link:'<path d="m10 13 4-4m-6 6-2 2a3 3 0 01-4-4l5-5a3 3 0 014 0m2 0 2-2a3 3 0 014 4l-5 5a3 3 0 01-4 0"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',chevron:'<path d="m9 5 7 7-7 7"/>'};
const icon=(name)=>`<svg aria-hidden="true" viewBox="0 0 24 24">${icons[name]||icons.info}</svg>`;
const main=document.querySelector('#main');
function fillIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}

export { icon, main, fillIcons, icons };
import('./experience.js');
