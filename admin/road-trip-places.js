// The browser gets aggregate metrics/config only, never a provider API key,
// private route, cached POI payload or another user's journey.
const bounds={poi_ttl_seconds:[3600,2592000],empty_ttl_seconds:[60,3600],daily_credit_limit:[1,3000],
  user_daily_limit:[1,10],max_sections:[1,12],corridor_meters:[100,10000],section_meters:[20000,200000]};
export function roadTripPlacesSettingsInput(config,revision){
  if(!config||Object.keys(config).sort().join()!==['enabled','cache_enabled','quality_research_enabled',...Object.keys(bounds)].sort().join()||
    typeof config.enabled!=='boolean'||typeof config.cache_enabled!=='boolean'||typeof config.quality_research_enabled!=='boolean'||!Number.isSafeInteger(revision)||revision<1)
    throw new Error('Geçersiz ayar veya sürüm. Önce yenileyin.');
  const result={enabled:config.enabled,cache_enabled:config.cache_enabled,quality_research_enabled:config.quality_research_enabled};
  for(const [key,[lo,hi]]of Object.entries(bounds)){
    if(!/^\d+$/.test(String(config[key])))throw new Error('Tam sayı giriniz.');
    const value=Number(config[key]);
    if(!Number.isSafeInteger(value)||value<lo||value>hi)throw new Error(`Değer ${lo}–${hi} arasında olmalı.`);
    result[key]=value;
  }
  return {p_config:result,p_expected_revision:revision};
}
const mounts=new WeakMap();
export function unmountRoadTripPlaces(root){
  if(!root)return;
  const session=mounts.get(root);if(session)session.active=false;
  mounts.delete(root);root.replaceChildren();
}
export function mountRoadTripPlaces(root,rpc,notify,actorId){
  const previous=mounts.get(root);
  if(previous?.actorId===actorId)return;
  if(previous)previous.active=false;
  const session={actorId,active:true};mounts.set(root,session);
  const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
  const panel=el('article');panel.className='panel panel-card road-trip-places-panel';
  panel.append(el('h2','Yolculuk mekanları · Geoapify ve ortak cache'),
    el('p','Yalnız herkese açık mekan verileri paylaşılır. Kayıtlı yolculuklar/ev adresleri cache’e yazılmaz. API anahtarı yalnız sunucuda tutulur.'),
    el('p','Free plan: 3.000 kredi/gün. Varsayılan bütçe 2.700; diğer servisler için 300 kredi pay bırakır. Sayaçlar UTC gece yarısında yeni güne geçer. Bu limit yalnız bu entegrasyonun harcamasını sınırlar.'),
    el('p','1 API çağrısı en fazla 20 mekan ve 1 kredi. Cache isabeti Geoapify kredisi tüketmez; kalite/AI ve Valhalla maliyetleri ayrıdır. Mekan listesi kalite veya açık olma garantisi değildir. Çalışma saatleri şu anda sorgulanmaz.'));
  const status=el('p','Ayarları yüklemek için Yenile’ye basın.');status.setAttribute('aria-live','polite');
  const inputs={};
  for(const [key,text]of Object.entries({enabled:'Mekan aramasını etkinleştir',cache_enabled:'Ortak cache’i etkinleştir',
    quality_research_enabled:'Bağımsız AI kalite araştırması (ek süre/maliyet; AI için ayrıca günlük 10 arama ve genel güvenlik kotası geçerlidir)',
    daily_credit_limit:'Günlük Geoapify kredi bütçesi (1–3000)',user_daily_limit:'Kullanıcı başına günlük arama (1–10)',
    poi_ttl_seconds:'Mekan cache süresi · saniye (3600–2592000; 7 gün = 604800)',
    empty_ttl_seconds:'Başarılı boş sonuç cache süresi · saniye (60–3600; 15 dk = 900)',
    max_sections:'Arama başına azami rota bölümü/kredi (1–12)',corridor_meters:'Rota çevresi · metre (100–10000)',
    section_meters:'Hedef rota bölümü uzunluğu · metre (20000–200000)'})){
    const label=el('label',text),control=el('input');control.type=bounds[key]?'number':'checkbox';
    control.setAttribute('data-setting',key);
    if(bounds[key]){[control.min,control.max]=bounds[key];control.step=1;}
    label.append(control);panel.append(label);inputs[key]=control;
  }
  const save=el('button','Ayarları kaydet'),refresh=el('button','Yenile'),clear=el('button','Ortak cache’i temizle');
  for(const b of [save,refresh,clear]){b.type='button';b.className='button button-secondary';}
  save.className='button button-primary';clear.className='button button-danger';
  let revision=null,busy=false;
  const current=()=>session.active&&mounts.get(root)===session;
  const lock=()=>{for(const control of [...Object.values(inputs),save,clear])control.disabled=busy||revision===null;refresh.disabled=busy;};
  const render=value=>{
    roadTripPlacesSettingsInput(value?.config,value?.revision);
    for(const key of ['credits_reserved','cache_hits','cache_misses','cache_waits','provider_errors','fresh_entries'])
      if(!Number.isSafeInteger(value[key])||value[key]<0)throw new Error('Geçersiz kullanım yanıtı.');
    for(const [key,control]of Object.entries(inputs)){if(control.type==='checkbox')control.checked=value.config[key];else control.value=value.config[key];}
    revision=value.revision;
    status.textContent=`${value.usage_day} UTC · Ayrılan kredi ${value.credits_reserved}/${value.config.daily_credit_limit} · `+
      `Cache isabeti ${value.cache_hits} · Yeni sorgu ${value.cache_misses} · Bekleme ${value.cache_waits} · `+
      `Sağlayıcı hatası ${value.provider_errors} · Güncel cache kaydı ${value.fresh_entries}. `+
      'Kredi sayısı güvenli üst sınırdır; Geoapify paneli ile bire bir fatura sayacı değildir. Düğmeyi açmak için sunucuda GEOAPIFY_API_KEY ve güncel mobil paket gerekir.';
  };
  async function run(name,args,success){
    if(busy||!current())return;busy=true;lock();
    try{const value=await rpc(name,args);if(!current())return;render(value);if(success)notify(success);}
    catch(e){if(current()){revision=null;status.textContent=`İşlem doğrulanamadı: ${e.message}. Güncel durumu yenileyin.`;}}
    finally{if(current()){busy=false;lock();}}
  }
  refresh.onclick=()=>run('admin_get_road_trip_places_settings');
  save.onclick=async()=>{
    if(busy||revision===null||!current())return;
    try{
      const config=Object.fromEntries(Object.entries(inputs).map(([key,node])=>[key,node.type==='checkbox'?node.checked:node.value]));
      const args=roadTripPlacesSettingsInput(config,revision);
      if(!window.confirm('Bu ayarlar tüm kullanıcıları etkiler ve eski cache’i geçersiz kılar. Kullanılan krediler sıfırlanmaz. Kaydedilsin mi?'))return;
      await run('admin_update_road_trip_places_settings',args,'Mekan arama ayarları kaydedildi.');
    }catch(e){status.textContent=e.message;}
  };
  clear.onclick=()=>{
    if(busy||revision===null||!current())return;
    if(!window.confirm('Ortak mekan cache’i silinsin mi? Sonraki aramalar yeniden kredi tüketir. Kullanım sayaçları SIFIRLANMAZ.'))return;
    return run('admin_clear_road_trip_places_cache',{p_expected_revision:revision},'Ortak cache temizlendi; kredi sayacı korundu.');
  };
  panel.append(status,save,refresh,clear);root.replaceChildren(panel);lock();
}
