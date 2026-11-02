# Download Manager

Windows ve macOS için, tarayıcıyla bütünleşik, **çok bağlantılı**, **kaldığı yerden devam eden** ve **kesintiye dayanıklı** masaüstü indirme yöneticisi.

Tek kod tabanı (Electron + TypeScript + React) her iki işletim sistemi için de yerel paket üretir:

| Platform | Çıktı |
| --- | --- |
| macOS (Apple Silicon + Intel) | `.dmg` ve `.zip` |
| Windows (x64 + ARM64) | Kurulum `Setup.exe` ve kurulumsuz `Portable.exe` |
| Tarayıcı eklentisi | Chrome, Edge, Brave, Opera, Vivaldi ve Firefox |

---

## Özellikler

### İndirme motoru
- **Çok bağlantılı indirme:** Dosya en fazla 32 bölüme ayrılır, her bölüm ayrı bir bağlantıyla paralel iner. Varsayılan bağlantı sayısı 8'dir.
- **Dinamik bölümleme (IDM tarzı):** İşini bitiren bağlantı, en çok işi kalan bölümü ikiye bölüp yarısını devralır. İndirmenin sonunda tek bir yavaş bağlantıyı beklemek gerekmez.
- **Kaldığı yerden devam:** Duraklatma, ağ kopması, uygulama kapanması, çökme veya elektrik kesintisinden sonra indirme kaldığı yerden sürer. İlerleme yalnızca veri diske yazıldıktan sonra kaydedildiği için kayıt hiçbir zaman bozuk olmaz.
- **Otomatik yeniden deneme:** Kopan bağlantılar üstel geri çekilmeyle (backoff) yeniden denenir; varsayılan deneme sayısı sınırsızdır. Sunucunun `Retry-After` başlığına uyulur.
- **Sunucu sınırlarına uyum:** Sunucu fazla bağlantıyı `429`/`503` ile reddederse bağlantı sayısı kendiliğinden düşürülür.
- **Uykudan uyanınca toparlanma:** Bilgisayar uykudan uyandığında bekleyen bağlantılar hemen yeniden kurulur.
- **Tek dosyaya doğrudan yazma:** Bölümler `.dmpart` dosyasına konumlarına göre yazılır. Sonda birleştirme adımı ve iki kat disk kullanımı yoktur.
- **Disk alanı kontrolü:** Başlamadan önce yeterli boş alan olup olmadığına bakılır.
- **Dosya değişikliği tespiti:** Sunucudaki dosya değiştiyse (boyut farklıysa) bozuk birleşim yapılmaz.
- **Süresi dolmuş bağlantıyı yenileme:** Yeni bir adres yapıştırılır, indirme kaldığı yerden sürer.
- **Checksum doğrulama:** MD5, SHA-1, SHA-256 ve SHA-512. Beklenen hash verilirse indirme bitince otomatik doğrulanır; istenirse sonradan hesaplanabilir.
- **HTTP, HTTPS, FTP ve FTPS** desteklenir.
- **HLS video (m3u8):** Kalite seçimi, AES-128 şifre çözme, ayrı ses izi. ffmpeg kuruluysa sonuç tek bir `.mp4` dosyası olur.
- **Proxy:** Sistem ayarı, HTTP, HTTPS ve SOCKS5 (kullanıcı adı/şifre ile).
- **Kimlik doğrulama ve başlıklar:** Kullanıcı adı/şifre, çerez, Referer ve User-Agent.

### Tarayıcı entegrasyonu
- Tarayıcıdaki indirmeleri yakalayıp uygulamaya gönderir. Çerezler, Referer ve User-Agent da aktarılır, böylece giriş gerektiren siteler de çalışır.
- Uygulama kapalıysa indirme sessizce tarayıcıya bırakılır; hiçbir indirme kaybolmaz.
- Hangi uzantıların yakalanacağı, en küçük dosya boyutu ve hariç tutulacak siteler ayarlanabilir.
- **Sağ tık menüsü:** "Download Manager ile indir", "Bu medyayı indir", "Seçili bağlantıları indir", "Sayfadaki tüm bağlantıları indir".
- **Video yakalama:** Sayfadaki videolar ve HLS akışları algılanır, simgede sayıları görünür. Videoların üzerinde **"İndir" düğmesi** çıkar.

### Kuyruk, zamanlayıcı ve otomasyon
- Aynı anda en fazla N indirme (genel ve kuyruk başına ayrı ayrı).
- Birden çok kuyruk; her biri için başlama/durma saati ve gün seçimi.
- Bilgisayar uyurken kaçırılan başlama saati, uyanınca uygulanır.
- **Bitince:** Uyku, bilgisayarı kapatma veya uygulamadan çıkma (60 sn geri sayım, iptal edilebilir).
- Bitince özel bir komut çalıştırma (ör. virüs taraması: `{file}` ve `{dir}` yer tutucuları).
- Genel ve indirme başına **hız sınırı** (anında açılıp kapatılabilir).
- İndirme sürerken bilgisayarın uykuya geçmesini engelleme.

### Arayüz
- Türkçe ve İngilizce; açık, koyu ve sistem teması.
- Kategoriler (Arşivler, Belgeler, Müzik, Video, Programlar, Resimler); her kategori için ayrı klasör tanımlanabilir.
- Arama, sütunlara göre sıralama, çoklu seçim (Shift/Ctrl/Cmd) ve sağ tık menüsü.
- Ayrıntı paneli: canlı **bölüm haritası**, **hız grafiği**, bağlantı sayısı ve hız sınırı.
- Toplu indirme: `resim[001-150].jpg` gibi desenler, adres listesi ve `.txt` dosyasından içe aktarma.
- Pano izleme: kopyalanan indirme bağlantısı otomatik yakalanır.
- Bağlantıyı pencereye sürükle-bırak veya yapıştır (Ctrl/Cmd+V).
- Sistem tepsisi (menü çubuğu) simgesi; macOS'ta anlık hız menü çubuğunda görünür. Dock/görev çubuğunda ilerleme gösterilir. Bildirimler ve tamamlanma sesi vardır.
- Bilgisayar açılınca başlatma ve tepside çalışma.
- `dlmanager://add?url=...` bağlantı protokolü.

---

## Hızlı başlangıç (geliştirme)

Gereksinim: **Node.js 22.12+** (24 önerilir).

```bash
git clone https://github.com/tngokce/downloadManager.git
cd downloadManager
npm install
npm run dev        # Uygulamayı geliştirme modunda açar
```

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme modu (sıcak yeniden yükleme) |
| `npm test` | Tüm testler (motor, yönetici, köprü, zamanlayıcı) |
| `npm run typecheck` | TypeScript tip kontrolü |
| `npm run build` | Üretim derlemesi (`out/`) |
| `npm run dist:mac` | macOS `.dmg` + `.zip` → `release/` |
| `npm run dist:win` | Windows `Setup.exe` + `Portable.exe` → `release/` |
| `npm run extension` | Eklentiyi Chrome ve Firefox için paketler → `extension-dist/` |
| `npm run icons` | `resources/*.svg` dosyalarından tüm simgeleri yeniden üretir |

### Windows ve macOS için nasıl derlenir?

Kod tek; her işletim sistemi için ayrı paket üretilir:

- **En kolay yol (önerilen):** GitHub'a gönderdiğinde `.github/workflows/build.yml` testleri çalıştırır, sonra **macOS ve Windows makinelerinde** paketleri ayrı ayrı üretir. Paketler Actions sayfasındaki "Artifacts" bölümünden indirilir. `v1.0.0` gibi bir etiket gönderildiğinde dosyalar otomatik olarak bir GitHub Release'e de eklenir:
  ```bash
  git tag v1.0.0 && git push origin v1.0.0
  ```
- **Mac'te:** `npm run dist:mac`
- **Windows'ta:** `npm run dist:win`
- **Mac'ten Windows paketi:** Apple Silicon Mac'lerde önce Rosetta gerekir (`softwareupdate --install-rosetta`), sonra `npm run dist:win`.

> **İmza notu:** Paketler varsayılan olarak imzasızdır.
> - **macOS:** İlk açılışta uygulamaya sağ tıklayıp **Aç**'ı seçin. Alternatif: `xattr -cr "/Applications/Download Manager.app"`
> - **Windows:** SmartScreen uyarısında **Ek bilgi → Yine de çalıştır**'ı seçin.
>
> Sertifikanız varsa `CSC_LINK` ve `CSC_KEY_PASSWORD` ortam değişkenleri (veya GitHub secrets) ile paketler otomatik imzalanır.

---

## Tarayıcı eklentisini kurma

1. Uygulamayı açın. Ayarlar → **Tarayıcı** → **Eklenti klasörünü aç**'a tıklayın. Geliştirme sırasında bu klasör depodaki `extension/` klasörüdür.
2. **Chrome / Edge / Brave / Opera / Vivaldi:**
   `chrome://extensions` (Edge'de `edge://extensions`) → sağ üstten **Geliştirici modu**'nu açın → **Paketlenmemiş öğe yükle** → `extension` klasörünü seçin.
3. **Firefox:** `npm run extension` komutunu çalıştırın → `about:debugging#/runtime/this-firefox` → **Geçici eklenti yükle** → `extension-dist/firefox/manifest.json`.
   Firefox'ta eklentinin ayrıntılarından **"Tüm sitelerdeki verilerinize erişim"** iznini açın.
4. Eklenti simgesine tıklayın: **"Uygulamaya bağlı"** yazmalıdır.

Ayrıntılar: [docs/EKLENTI.md](docs/EKLENTI.md)

---

## Video (HLS) için ffmpeg (isteğe bağlı)

ffmpeg kurulu değilse HLS videoları `.ts` olarak kaydedilir; ayrı ses izi de ayrı bir dosyaya yazılır. ffmpeg kuruluysa ses ve görüntü tek bir `.mp4` dosyasında birleştirilir.

- macOS: `brew install ffmpeg`
- Windows: `winget install Gyan.FFmpeg`

Uygulama ffmpeg'i Homebrew, winget, Chocolatey ve Scoop'un kurduğu konumlarda otomatik bulur. İsterseniz yolu Ayarlar → Video bölümünden elle girebilirsiniz.

> DRM korumalı içerikler (Netflix, Disney+ vb. Widevine/FairPlay) ve canlı yayınlar desteklenmez.

---

## Klavye kısayolları

| Kısayol | İşlem |
| --- | --- |
| `Ctrl/Cmd + N` | Adres ekle |
| `Ctrl/Cmd + Shift + N` | Toplu indirme |
| `Ctrl/Cmd + ,` | Ayarlar |
| `Ctrl/Cmd + F` | Ara |
| `Ctrl/Cmd + A` | Tümünü seç |
| `Ctrl/Cmd + V` | Panodaki bağlantıyı ekle |
| `Boşluk` | Seçilenleri duraklat / devam ettir |
| `Enter` | Dosyayı aç |
| `Delete` (macOS: `⌫`) | Sil (`Shift` ile dosyayla birlikte) |
| `↑ / ↓` | Satırlar arasında gezin |

---

## Veriler nerede saklanır?

| Platform | Konum |
| --- | --- |
| macOS | `~/Library/Application Support/Download Manager/` |
| Windows | `%APPDATA%\Download Manager\` |

Bu klasörde `downloads.json` (liste ve ilerleme), `settings.json`, `queues.json` ve `window.json` bulunur. Tüm dosyalar atomik olarak yazılır (önce geçici dosyaya yazılıp sonra yeniden adlandırılır).

---

## Belgeler

- [docs/MIMARI.md](docs/MIMARI.md): Mimari, indirme motorunun çalışma şekli, güvenlik
- [docs/EKLENTI.md](docs/EKLENTI.md): Tarayıcı eklentisinin ayrıntıları
- [docs/GELISTIRME.md](docs/GELISTIRME.md): Geliştirme, test, sürüm çıkarma

## Lisans

[MIT](LICENSE)
