export async function createAccount(notify){
 let config;try{const response=await fetch(new URL('data/firebase-config.json',import.meta.url),{cache:'no-store'});if(!response.ok)throw Error();config=await response.json();}catch{return {configured:false,user:null,ready:false};}
 if(!config.apiKey||!config.projectId||!config.authDomain||!config.appId)return {configured:false,user:null,ready:false};
 const {connect}=await import('./vendor/firebase-client.js');return connect(config,notify);
}
