# Tarayıcı Eklentisi

`extension/` klasörü Manifest V3 eklentisidir. Aynı kod Chromium tabanlı tüm tarayıcılarda (Chrome, Edge, Brave, Opera, Vivaldi) ve Firefox'ta (121+) çalışır.

## Dosyalar

| Dosya | Görev |
| --- | --- |
| `manifest.json` | Chrome manifesti. Firefox sürümü `npm run extension` ile üretilir. |
| `background.js` | İndirme yakalama, uygulama bağlantısı, sağ tık menüleri, medya algılama |
| `content.js` | Videoların üzerindeki "İndir" düğmesi (Shadow DOM içinde; sayfanın CSS'i etkilemez) |
| `popup.*` | Simgeye tıklayınca açılan pencere: bağlantı durumu, yakalamayı aç/kapat, bulunan videolar |
| `options.*` | Özel köprü portu |
| `_locales/` | Türkçe ve İngilizce metinler |

## İndirme yakalama akışı

1. **Chrome:** `downloads.onDeterminingFilename` kullanılır; bu aşamada sunucunun verdiği gerçek dosya adı bilinir. **Firefox:** `downloads.onCreated` kullanılır.
2. Uygulamaya `GET /ping` gönderilir (5 sn önbellekli). Bu yanıt uygulamanın ayarlarını da içerir: yakalanacak uzantılar, en küçük boyut, hariç siteler.
3. Uzantı listede yoksa, dosya küçükse, site hariç tutulmuşsa veya adres `blob:`/`data:` ise indirme tarayıcıda kalır.
4. Aksi halde tarayıcıdaki indirme iptal edilir ve `POST /add` ile şunlar gönderilir: adres, son adres, dosya adı, Referer, **çerezler** (gizli pencerede gizli çerez deposu kullanılır), User-Agent, MIME türü ve boyut.
5. Uygulamaya ulaşılamazsa indirme **tarayıcıda yeniden başlatılır**; böylece hiçbir indirme kaybolmaz.

## Video algılama

- `webRequest.onHeadersReceived` ile `video/*`, `audio/*` ve HLS (`mpegurl`, `.m3u8`) yanıtları izlenir. Bu izleme engelleyici değildir; sayfayı yavaşlatmaz.
- 512 KB'tan küçük medya ile HLS/DASH parçaları (`.ts`, `.m4s`), bayt aralığı istekleri ve YouTube'un parça akışları elenir.
- Bulunanlar sekme başına saklanır (`storage.session`) ve simgede sayıları gösterilir. Sayfa değişince liste temizlenir.
- Videonun üzerindeki düğme:
  - Video doğrudan bir dosyaysa o adres gönderilir.
  - Video `blob:` ise (MSE oynatıcı), algılanan HLS akışı ya da en büyük medya dosyası gönderilir.

## Sağ tık menüleri

| Menü | Ne gönderir |
| --- | --- |
| Download Manager ile indir (bağlantı) | Bağlantı + sayfa çerezleri |
| Bu medyayı indir (video/ses/resim) | Medya adresi; `blob:` ise algılanan akış |
| Seçili bağlantıları indir | Seçimin içindeki tüm `<a>` bağlantıları → toplu indirme penceresi |
| Sayfadaki tüm bağlantıları indir | Tüm çerçevelerdeki bağlantılar ve medya kaynakları → toplu indirme penceresi (uzantıya göre süzülebilir) |

## İzinler ve nedenleri

| İzin | Neden |
| --- | --- |
| `downloads` | İndirmeleri yakalamak, iptal etmek, gerekirse tarayıcıya geri vermek |
| `cookies` + `<all_urls>` | Giriş gerektiren indirmelerin uygulamada da çalışması |
| `webRequest` | Video/HLS akışlarını algılamak (yalnızca okuma) |
| `scripting` | "Tüm bağlantıları indir" için sayfadaki bağlantıları toplamak |
| `contextMenus`, `notifications`, `storage`, `tabs` | Menüler, "uygulama çalışmıyor" uyarısı, ayarlar, sekme bilgisi |

Eklenti hiçbir veriyi internete göndermez. Tek iletişim, aynı bilgisayardaki uygulamayla (`127.0.0.1`) kurulur.

## Mağazada yayınlama

`npm run extension` komutu `extension-dist/download-manager-chrome-X.zip` ve `...-firefox-X.zip` dosyalarını üretir:

- Chrome Web Store ve Edge Add-ons'a Chrome zip'i yüklenir.
- Firefox Add-ons (AMO) sitesine Firefox zip'i yüklenir.
