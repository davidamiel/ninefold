import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {attachEditorPanel} from '../dist/editor-panel.js';
import {formatParagraph} from '../dist/reader-format.js';
import {captureReader,readerOutline,renderReaderContent} from '../dist/reader-content.js';

test('reader navigation and rerender leave the minimized draft available',()=>{
 const dom=new JSDOM('<main><button>Navigate</button></main><section><input value="draft"></section>');
 const doc=globalThis.document=dom.window.document,panel=doc.querySelector('section');
 let navigated=false;doc.querySelector('main button').onclick=()=>{navigated=true;doc.querySelector('main').replaceChildren();};
 const dock=attachEditorPanel(panel,'Draft',()=>panel.querySelector('input').focus());
 dock.minimize();doc.querySelector('main button').click();assert(navigated);
 doc.querySelector('.editor-resume').click();assert(!panel.hidden);assert.equal(doc.activeElement.value,'draft');
 dock.remove();assert(!doc.querySelector('.editor-resume'));
});

test('paragraph heading levels and indentation round-trip into the published outline',()=>{
 const dom=new JSDOM('<section id="edit"><span class="page-text">Opening.\n\nA heading\n\nClosing.</span></section>');
 const doc=globalThis.document=dom.window.document,root=doc.querySelector('#edit'),r=doc.createRange();
 r.setStart(root.firstChild.firstChild,13);r.collapse(true);
 let selected=formatParagraph(root,r,'1');selected=formatParagraph(root,selected,'3');selected=formatParagraph(root,selected,'indent');
 const value={nodes:captureReader(root),revision:'test',references:[]};
 assert.deepEqual(readerOutline(value),[{text:'A heading',level:2,index:0}]);
 assert.match(renderReaderContent(value),/editor-indent-1/);
 formatParagraph(root,selected,'body');assert.equal(readerOutline({nodes:captureReader(root)}).length,0);assert.equal(root.textContent,'Opening.\n\nA heading\n\nClosing.');
});
