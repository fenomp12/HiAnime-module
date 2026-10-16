/*
 * HiAnime (hianime.at) — Shirox / Sora — v1.0.0
 * One standalone JavaScript file; no user-hosted proxy, key or dependencies.
 * Uses only the four-argument fetchv2 bridge and UTF-8 HTML/JSON responses.
 * SUB audio + English subtitles by default. Change HA_AUDIO to 'dub' for DUB.
 * Sora manifest settings, if needed: asyncJS=true, softsub=true, streamType=HLS.
 * Shirox imports this JS directly through its file module importer.
 */
var HA_BASE='https://hianime.at';
var HA_AUDIO='sub';
var HA_SUBTITLE_LANGUAGE='en';
var HA_UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function haLog(stage,error) {
    if(typeof console!=='undefined'&&typeof console.log==='function')
        console.log('[HiAnime-Shirox 1.0.0] '+stage+': '+String(error&&error.message||error));
}
function haText(value) {
    return String(value===undefined||value===null?'':value).replace(/<[^>]*>/g,' ')
        .replace(/&#x([\da-f]+);/gi,function(_,n){return String.fromCodePoint(parseInt(n,16));})
        .replace(/&#(\d+);/g,function(_,n){return String.fromCodePoint(Number(n));})
        .replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&nbsp;/g,' ')
        .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')
        .replace(/\s+/g,' ').trim();
}
function haAttr(tag,name) {
    var m=String(tag).match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));
    return m?haText(m[1]!==undefined?m[1]:m[2]!==undefined?m[2]:m[3]):'';
}
function haAbsolute(value,base) {
    value=haText(value).replace(/\\\//g,'/');base=base||HA_BASE;
    if(/^https?:\/\//i.test(value))return value;
    if(value.indexOf('//')===0)return 'https:'+value;
    if(!value)return '';
    var origin=base.match(/^https?:\/\/[^/]+/i);
    return value.charAt(0)==='/'?(origin?origin[0]:HA_BASE)+value:base.replace(/\/$/,'')+'/'+value;
}
function haOrigin(url) {var m=String(url).match(/^https?:\/\/[^/]+/i);return m?m[0]:HA_BASE;}
function haSlug(url) {
    var s=String(url||'').match(/^(?:https?:\/\/[^/]+)?\/(?:watch\/)?([a-z0-9][a-z0-9-]*-\d+)(?:[/?#]|$)/i);
    if(!s)throw new Error('Invalid HiAnime title URL.');
    return s[1];
}
async function soraFetch(url,options) {
    options=options||{};
    if(typeof fetchv2==='function') {
        try {return await fetchv2(url,options.headers||{},options.method||'GET',options.body||null);}
        catch(e){if(typeof fetch!=='function')throw e;}
    }
    if(typeof fetch==='function')return await fetch(url,options);
    throw new Error('No supported HTTP bridge.');
}
async function haGet(url,headers) {
    var response=await soraFetch(url,{headers:Object.assign({'User-Agent':HA_UA,Referer:HA_BASE+'/',Accept:'*/*'},headers||{})});
    if(!response)throw new Error('Empty HTTP response.');
    if(response.error)throw new Error(String(response.error));
    if(Number(response.status)>=400)throw new Error('HTTP '+response.status+' from '+haOrigin(url));
    var text=typeof response==='string'?response:typeof response.text==='function'?await response.text():typeof response.text==='string'?response.text:typeof response.body==='string'?response.body:response._data;
    if(typeof text!=='string'||!text.length)throw new Error('Empty response body.');
    if(/<title>\s*Just a moment|cf-chl-|Checking your browser/i.test(text))throw new Error('This host requires verification in Shirox.');
    return text;
}
async function haJson(url) {
    var value=JSON.parse(await haGet(url,{'X-Requested-With':'XMLHttpRequest'}));
    if(value&&value.status===false)throw new Error('The source API returned an error.');
    return value;
}
function haParseSearch(html) {
    // Ignore the sidebar's repeated and unrelated "Top 10" cards.
    html=String(html).split(/\bid=["']main-sidebar["']/i)[0];
    var cards=html.split(/<div\b[^>]*class=["'][^"']*\bflw-item\b[^"']*["'][^>]*>/i).slice(1);
    var rows=[],seen={};
    cards.forEach(function(card){
        var name=card.match(/<h3\b[^>]*class=["'][^"']*film-name[^"']*["'][^>]*>[\s\S]*?<a\b([^>]*)>([\s\S]*?)<\/a>/i);
        var img=card.match(/<img\b[^>]*>/i);
        if(!name||!img)return;
        var href=haAbsolute(haAttr(name[1],'href')),title=haAttr(name[1],'title')||haText(name[2]);
        var image=haAbsolute(haAttr(img[0],'data-src')||haAttr(img[0],'src'));
        try {var slug=haSlug(href);}catch(e){return;}
        if(seen[slug]||!title||!image)return;seen[slug]=true;
        rows.push({title:title,image:image,href:HA_BASE+'/'+slug});
    });
    return rows;
}
async function searchResults(keyword) {
    try {
        keyword=String(keyword||'').trim();if(!keyword)return JSON.stringify([]);
        var rows=haParseSearch(await haGet(HA_BASE+'/search?keyword='+encodeURIComponent(keyword)));
        haLog('search',rows.length+' results for '+keyword);
        return JSON.stringify(rows);
    }catch(e){haLog('search',e);return JSON.stringify([]);}
}
async function extractDetails(url) {
    try {
        var html=await haGet(HA_BASE+'/'+haSlug(url));
        var desc=html.match(/class=["'][^"']*film-description[^"']*["'][^>]*>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i);
        function field(label) {
            var m=html.match(new RegExp('<span\\b[^>]*class=["\'][^"\']*item-head[^"\']*["\'][^>]*>\\s*'+label+':\\s*<\\/span>\\s*<span\\b[^>]*>([\\s\\S]*?)<\\/span>','i'));
            return m?haText(m[1]):'';
        }
        var aliases=[field('Japanese'),field('Synonyms')].filter(function(v){return !!v;}).join(' | ');
        return JSON.stringify([{description:desc?haText(desc[1]):'N/A',aliases:aliases||'N/A',airdate:field('Aired')||'N/A'}]);
    }catch(e){haLog('details',e);return JSON.stringify([]);}
}
function haParseEpisodes(html,slug) {
    var tags=String(html).match(/<a\b[^>]*>/gi)||[],rows=[],seen={};
    tags.forEach(function(tag){
        if(!/\bep-item\b/.test(haAttr(tag,'class')))return;
        var number=Number(haAttr(tag,'data-number')),id=haAttr(tag,'data-id');
        if(!/^[0-9]+$/.test(id)||!isFinite(number)||number<=0||seen[number])return;
        var link=haAbsolute(haAttr(tag,'href'));
        // Do not accept an episode of a different show if the endpoint changes.
        if(link&&link.indexOf('/watch/'+slug+'?')<0)return;
        seen[number]=true;
        rows.push({number:number,title:haAttr(tag,'title')||'Episode '+number,href:HA_BASE+'/watch/'+slug+'?ep='+id});
    });
    rows.sort(function(a,b){return a.number-b.number;});return rows;
}
async function extractEpisodes(url) {
    try {
        var slug=haSlug(url),id=slug.match(/-(\d+)$/)[1];
        var data=await haJson(HA_BASE+'/api/theme/episode/list/'+id);
        var rows=haParseEpisodes(data.html||'',slug);
        haLog('episodes',rows.length+' episodes');return JSON.stringify(rows);
    }catch(e){haLog('episodes',e);return JSON.stringify([]);}
}
function haBase64Bytes(input) {
    var chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',s=String(input).replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(s)||s.length%4===1)throw new Error('Invalid encoded player data.');
    var bytes=[],bits=0,value=0;
    for(var i=0;i<s.length&&s.charAt(i)!=='=';i++) {
        var n=chars.indexOf(s.charAt(i));if(n<0)throw new Error('Invalid base64.');
        value=(value<<6)|n;bits+=6;
        if(bits>=8){bits-=8;bytes.push((value>>bits)&255);value&=(1<<bits)-1;}
    }
    return bytes;
}
function haUtf8(bytes) {
    var s='';for(var i=0;i<bytes.length;i++)s+='%'+('0'+bytes[i].toString(16)).slice(-2);
    return decodeURIComponent(s);
}
function haPlayerConfig(html) {
    var m=String(html).match(/window\.__P\s*=\s*(["'])([A-Za-z0-9+/_=\-]+)\1/);
    if(!m)throw new Error('The player did not expose its text configuration.');
    var b=haBase64Bytes(m[2]),key='otaku-embed-v1';
    for(var i=0;i<b.length;i++)b[i]^=key.charCodeAt(i%key.length);
    return JSON.parse(haUtf8(b));
}
function haServers(html) {
    var tags=String(html).match(/<[^>]+\bdata-hash\s*=[^>]+>/gi)||[],rows=[];
    tags.forEach(function(tag){
        // Other embeds use different protocols; never hand an embed page to AVPlayer.
        if(haAttr(tag,'data-server-name')!=='ZokoAnime')return;
        try {
            var url=haUtf8(haBase64Bytes(haAttr(tag,'data-hash'))),audio=haAttr(tag,'data-type');
            if(/^https?:\/\//.test(url)&&/^(sub|dub)$/.test(audio))rows.push({url:url,audio:audio});
        }catch(e){}
    });
    rows.sort(function(a,b){return (a.audio===HA_AUDIO?0:1)-(b.audio===HA_AUDIO?0:1);});return rows;
}
async function extractStreamUrl(url) {
    try {
        haSlug(url);var m=String(url).match(/[?&]ep=(\d+)(?:[&#]|$)/);
        if(!m)throw new Error('An episode URL with ep= is required.');
        var data=await haJson(HA_BASE+'/api/theme/episode/servers?episodeId='+m[1]);
        var servers=haServers(data.html||''),lastError;
        for(var i=0;i<servers.length;i++) {
            try {
                var server=servers[i],origin=haOrigin(server.url),headers={'User-Agent':HA_UA,Referer:origin+'/',Origin:origin};
                var config=haPlayerConfig(await haGet(server.url));
                var streamUrl=haAbsolute(config.src,origin);
                if(!/^https?:\/\/[^\s]+\.m3u8(?:[?#]|$)/i.test(streamUrl))throw new Error('The player has no native HLS source.');
                var playlist=await haGet(streamUrl,headers);
                if(!/^\s*#EXTM3U/.test(playlist))throw new Error('The source did not return a plain HLS playlist.');
                var tracks=(config.subtitles||[]).filter(function(t){return /^https?:\/\//i.test(t.src||t.url||'');}).map(function(t){return {title:t.label||t.lang||'Subtitles',language:t.lang||'',url:t.src||t.url,headers:headers,preferred:!!t.default};});
                var preferred=tracks.filter(function(t){return t.language.toLowerCase()===HA_SUBTITLE_LANGUAGE;})[0]||tracks.filter(function(t){return t.preferred;})[0]||tracks[0];
                var subtitle=preferred?preferred.url:'';
                var stream={title:'HiAnime · '+server.audio.toUpperCase()+' · Auto',streamUrl:streamUrl,headers:headers};
                if(subtitle)stream.subtitle=subtitle;
                var result={streams:[stream],subtitles:subtitle?[subtitle]:[],allSubtitles:tracks.map(function(t){return {title:t.title,url:t.url,headers:t.headers};})};
                if(subtitle){result.subtitle=subtitle;result.subtitleHeaders=headers;}
                haLog('stream','Validated native HLS ('+server.audio.toUpperCase()+').');return JSON.stringify(result);
            }catch(e){lastError=e;haLog('server',e);}
        }
        throw lastError||new Error('No supported server for this episode.');
    }catch(e){haLog('stream',e);return JSON.stringify({streams:[],subtitles:[]});}
}
