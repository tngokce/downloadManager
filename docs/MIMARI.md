# Mimari

## Genel yapı

```
┌──────────────── Tarayıcı ─────────────────┐
│  Eklenti (extension/)                     │
│  • indirmeleri yakalar  • video algılar   │
└──────────────┬────────────────────────────┘
               │ HTTP, yalnızca 127.0.0.1:53771
               ▼
┌──────────────── Ana süreç (src/main) ──────────────────────────┐
│  bridge.ts     ── eklenti köprüsü (Origin/Host doğrulamalı)    │
│  index.ts      ── pencereler, tepsi, menü, bildirim, pano      │
│  ipc.ts        ── arayüzden gelen çağrılar (girdi doğrulamalı) │
│  scheduler.ts  ── saatli kuyruk başlatma/durdurma              │
│  manager.ts    ── liste, kuyruklar, eşzamanlılık, canlı hız    │
│  store.ts      ── atomik JSON kayıt                            │
│  engine/       ── indirme motoru (Electron'dan bağımsız)       │
└──────────────┬─────────────────────────────────────────────────┘
               │ IPC (contextBridge, src/preload)
               ▼
┌──────────────── Arayüz (src/renderer, React) ──────────────────┐
│  MainApp, AddDialog (ayrı pencere), Settings, Scheduler, ...   │
└────────────────────────────────────────────────────────────────┘
```

`src/shared/` üç katmanın ortak kullandığı tipleri, varsayılan ayarları, biçimlendirme yardımcılarını ve dil dosyasını (TR/EN) içerir.

## İndirme motoru (`src/main/engine`)

Motor Electron'a bağımlı değildir; yalnızca Node.js ve `undici` kullanır. Bu sayede gerçek bir HTTP sunucusuna karşı doğrudan test edilir.

| Dosya | Görev |
| --- | --- |
| `http.ts` | Bağlantı havuzu (proxy, SOCKS5, TLS), yönlendirmeleri elle takip etme, hata sınıflandırma |
| `probe.ts` | `Range: bytes=0-0` isteğiyle boyutu, devam desteğini, dosya adını ve ETag'i öğrenme |
| `segments.ts` | Bölümleme ve dinamik bölme algoritması (yan etkisiz, birim testli) |
| `HttpDownloader.ts` | Çok bağlantılı HTTP indirici |
| `hls.ts` | m3u8 ayrıştırıcı ve HLS indirici |
| `ftp.ts` | FTP/FTPS indirici |
| `throttle.ts` | Token-bucket hız sınırlayıcı |
| `filename.ts` | Content-Disposition (RFC 5987), güvenli dosya adı, çakışmayan ad bulma |
| `checksum.ts` | Akış hâlinde hash hesaplama |
| `errors.ts` | Hataları arayüzün çevirebileceği kodlara dönüştürme |

### Çok bağlantılı indirme nasıl çalışır?

1. **Yoklama:** `GET` isteği `Range: bytes=0-0` ile gönderilir. Yanıt `206` ve `Content-Range: bytes 0-0/TOPLAM` ise dosya bölünebilir. `HEAD` kullanılmaz, çünkü birçok sunucu `HEAD`'e yanlış yanıt verir.
2. **Yer ayırma:** `dosya.dmpart` açılır ve toplam boyuta genişletilir. Böylece parçalanma azalır ve "disk dolu" hatası en başta yakalanır.
3. **Bölümleme:** Dosya `min(bağlantı sayısı, boyut / en küçük bölüm)` eşit parçaya ayrılır.
4. **İşçiler:** Her bağlantı kendi bölümünü `Range: bytes=pos-end` ile ister. Gelen veri yaklaşık 1 MiB'lık tamponlarda toplanır ve `pwrite` ile dosyadaki doğru konuma yazılır.
5. **Dinamik bölme:** İşi biten bağlantı, kalan kısmı en büyük olan bölümü ortadan ikiye böler ve ikinci yarıyı alır. Bölme noktası, o bölümün ağdan alınmış ama henüz diske yazılmamış verisinin **ilerisinde** seçilir. Böylece iki bağlantı asla aynı baytı yazmaz.
6. **Güvenli ilerleme:** Bir bölümün `pos` değeri yalnızca veri diske yazıldıktan sonra artar. Yönetici bu değerleri periyodik olarak kaydeder. Çökme olursa en fazla son tampon kadar veri yeniden indirilir.
7. **Hata yönetimi:**
   - Ağ hataları üstel geri çekilmeyle yeniden denenir.
   - `401` ve `407` hemen kalıcı hata sayılır.
   - `403`, `404` ve `410` üç denemeden sonra kalıcı hata olur ("adresi yenileyin").
   - `429` ve `503` alındığında, başka bağlantılar da açıksa bağlantı sayısı azaltılır.
   - Disk dolu veya izin hatalarında yeniden denenmez.
8. **Bitiş:** `.dmpart` dosyası son adına taşınır. Aynı adda dosya varsa `dosya (1).zip` gibi yeni bir ad bulunur. Beklenen hash verildiyse doğrulanır.

Range desteklemeyen sunucularda tek bağlantı kullanılır. Bağlantı koparsa indirme mecburen baştan başlar. Boyutu bilinmeyen (chunked) yanıtlarda akışın sonu dosyanın sonu kabul edilir.

### HLS

- Ana liste (master) ayrıştırılır, kaliteler bant genişliğine göre sıralanıp kullanıcıya sunulur. Ayrı ses grubu (`EXT-X-MEDIA TYPE=AUDIO`) da ayrıca indirilir.
- Parçalar paralel iner ve `iş-klasörü/v-000001.seg` biçiminde saklanır. Her parça önce `.tmp` olarak yazılıp sonra yeniden adlandırılır. Böylece yarım parça hiç kalmaz ve devam ederken var olan parçalar atlanır.
- AES-128 parçaların şifresi, IV verilmemişse sıra numarasından türetilen IV ile çözülür. `EXT-X-MAP` (fMP4 başlangıç parçası) ve `EXT-X-BYTERANGE` desteklenir.
- Parçalar sırayla birleştirilir; ffmpeg varsa `-c copy` ile kalite kaybı olmadan `.mp4`'e aktarılır.
- `SAMPLE-AES` (DRM) ve `ENDLIST` içermeyen canlı yayınlar açık bir hata mesajıyla reddedilir.

## Yönetici (`manager.ts`)

- Listenin ve kuyrukların tek sahibidir. Arayüz ve ana süreç onunla olaylar (`added`, `patched`, `removed`, `live`, `completed`, `queueDone`) üzerinden konuşur.
- `pump()` boş yer oldukça sıradaki indirmeleri başlatır. Genel eşzamanlılık sınırına ve kuyruk başına sınıra uyar; durdurulmuş kuyrukları atlar.
- Her 500 ms'de bir canlı hız (üstel hareketli ortalama) ve kalan süre hesaplanır, değişen öğeler arayüze gönderilir ve kayıt güncellenir.
- Görevler ayarları canlı okur: hız sınırı, proxy ve yeniden deneme değişiklikleri çalışan indirmelere de hemen yansır.
- **Kapanış:** Yeni görev başlatılması engellenir (`closing`). Çalışan görevler "sırada" durumuyla duraklatılır ve ilerleme diske yazılır. `resumeOnStartup` açıksa bu indirmeler bir sonraki açılışta kendiliğinden sürer.

## Güvenlik

- **Pencereler:** `contextIsolation`, `sandbox` açık, `nodeIntegration` kapalı. Arayüz yalnızca preload'un izin verdiği işlevleri çağırabilir. Katı bir CSP uygulanır, sayfa içi gezinme ve yeni pencere açma engellenir.
- **IPC:** Tüm girdiler ana süreçte doğrulanır (adres şeması, kimlikler, hash algoritması).
- **Tarayıcı köprüsü:**
  - Yalnızca `127.0.0.1` dinlenir; ağdaki diğer cihazlar erişemez.
  - İstek bir tarayıcı eklentisinden gelmelidir: `Origin` bir eklenti adresi (`chrome-extension://`, `moz-extension://`) olmalı ya da hiç olmamalı ve `Sec-Fetch-Site: none` gönderilmelidir. Chrome, site izni olan eklentilerin isteklerine `Origin` eklemez, bu ikinci başlığı gönderir. Web sayfaları bu başlıkları taklit edemez (her zaman `Origin` ya da `Sec-Fetch-Site: cross-site` gönderirler), dolayısıyla bir site kullanıcı adına indirme başlatamaz.
  - `Host` başlığı kontrol edilir (DNS rebinding saldırılarına karşı).
  - İstek gövdesi en fazla 4 MB olabilir; adres şemaları doğrulanır (`javascript:` vb. reddedilir).
- **HTTP:** Başka bir siteye yönlendirmede `Cookie` ve `Authorization` başlıkları gönderilmez. TLS sertifikaları varsayılan olarak doğrulanır.
- **Dosyalar:** Dosya adları temizlenir (yol ayırıcıları, Windows'ta ayrılmış adlar, kontrol karakterleri). "Dosyayla sil" dosyayı kalıcı olarak silmez, çöp kutusuna taşır.

## Platform farkları

| Konu | macOS | Windows |
| --- | --- | --- |
| Pencere başlığı | `hiddenInset` (trafik ışıkları araç çubuğunda) | Standart çerçeve |
| Tepsi simgesi | Şablon (açık/koyu temaya uyar), anlık hız menü çubuğunda | Renkli simge, tıklayınca pencere açılır |
| İlerleme | Dock rozeti + ilerleme | Görev çubuğu ilerlemesi |
| Uyku | `pmset sleepnow` | `SetSuspendState` |
| Kapatma | AppleScript `shut down` | `shutdown /s` |
| Uygulama menüsü | Tam menü (Düzen menüsü kopyala/yapıştır için gerekli) | Menü yok |

## Test kancaları

Duman testi ve otomasyon için, gerçek kullanıcı verisine dokunmadan:

- `DM_USER_DATA=/klasör`: Ayarlar ve liste bu klasörde tutulur.
- `DM_SCREENSHOT=/dosya.png` (+ `DM_SCREENSHOT_DELAY=ms`): Açılıştan sonra odaklı pencerenin ekran görüntüsünü alıp çıkar.
- `DM_OPEN=settings|scheduler|batch`: Açılışta ilgili pencereyi açar.
