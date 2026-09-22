// Native modal dialogs isolate the background; explicitly wrap Tab so focus
// never escapes to browser chrome at the end of the dialog's controls.
export function installDialogFocus(){
  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||event.ctrlKey||event.altKey||event.metaKey)return;
    const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);if(!dialog)return;
    const controls=[...dialog.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
    if(!controls.length){event.preventDefault();dialog.tabIndex=-1;dialog.focus();return;}
    const first=controls[0],last=controls.at(-1),current=document.activeElement;
    if(!dialog.contains(current)){event.preventDefault();first.focus();}
    else if(event.shiftKey&&current===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&current===last){event.preventDefault();first.focus();}
  },true);
}
