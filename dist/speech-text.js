// Normalize only spoken text; source offsets and displayed quotations stay intact.
function roman(value){const values={I:1,V:5,X:10,L:50,C:100,D:500,M:1000};let n=0;for(let i=0;i<value.length;i++)n+=values[value[i]]<(values[value[i+1]]||0)?-values[value[i]]:values[value[i]];return n}
const numeral=/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
export function spokenText(text){return text.replace(/\b(Article|Title|Part|Chapter|Amendment)\s+([IVXLCDM]+)\b/g,(match,label,num)=>numeral.test(num)?label+' '+roman(num):match).replace(/([a-z])-\s*\n\s*([a-z])/g,'$1$2').replace(/\s*\n\s*/g,' ').replace(/“/g,'quote, ').replace(/[.,;:]?”/g,', end quote').replace(/"([^"\n]+)"/g,(_,quote)=>'quote, '+quote.replace(/[.,;:]$/,'')+', end quote').replace(/\s+/g,' ').trim()}
