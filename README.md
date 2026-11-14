<div align="center">

<img src="docs/assets/logo.png" alt="Gökçe Download Manager logosu" width="128" height="128">

# Gökçe Download Manager

**Windows ve macOS için hızlı, çok bağlantılı, kaldığı yerden devam eden ücretsiz indirme yöneticisi.**
Tarayıcı eklentisiyle Chrome, Edge, Brave, Opera, Vivaldi ve Firefox'taki indirmeleri otomatik olarak devralır.

[![Son sürüm](https://img.shields.io/github/v/release/tngokce/downloadManager?label=s%C3%BCr%C3%BCm)](https://github.com/tngokce/downloadManager/releases/latest)
[![Derleme](https://github.com/tngokce/downloadManager/actions/workflows/build.yml/badge.svg)](https://github.com/tngokce/downloadManager/actions/workflows/build.yml)
[![Lisans: MIT](https://img.shields.io/badge/lisans-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey)

**Türkçe** · [English](README.en.md)

[**⬇️ İndir**](https://github.com/tngokce/downloadManager/releases/latest) · [Kurulum](#-kurulum) · [Tarayıcı eklentisi](#-tarayıcı-eklentisini-kurma) · [Kullanım](#-kullanım) · [SSS](#-sık-sorulan-sorular)

</div>

---

## İçindekiler

- [Neden Gökçe Download Manager?](#-neden-gökçe-download-manager)
- [Özellikler](#-özellikler)
- [Sistem gereksinimleri](#-sistem-gereksinimleri)
- [Kurulum](#-kurulum)
  - [Windows](#windows)
  - [macOS](#macos)
- [Tarayıcı eklentisini kurma](#-tarayıcı-eklentisini-kurma)
- [Kullanım](#-kullanım)
- [Video (HLS) indirme ve ffmpeg](#-video-hls-indirme-ve-ffmpeg)
- [Klavye kısayolları](#-klavye-kısayolları)
- [Gizlilik ve güvenlik](#-gizlilik-ve-güvenlik)
- [Veriler nerede saklanır?](#-veriler-nerede-saklanır)
- [Kaldırma](#-kaldırma)
- [Sık sorulan sorular](#-sık-sorulan-sorular)
- [Sorun giderme](#-sorun-giderme)
- [Geliştiriciler için: kaynaktan derleme](#-geliştiriciler-için-kaynaktan-derleme)
- [Katkıda bulunma](#-katkıda-bulunma)
- [Lisans](#-lisans)

---

## 💡 Neden Gökçe Download Manager?

| Sorun | Çözüm |
| --- | --- |
| Büyük dosyalar yavaş iniyor | Dosya 32 parçaya kadar bölünür, her parça ayrı bağlantıyla **aynı anda** iner. |
| İnternet koptu, indirme sıfırlandı | İndirme **kaldığı yerden** devam eder; elektrik kesintisi veya çökme sonrasında bile. |
| Tarayıcıdaki indirmeyi duraklatamıyorum | Her indirme duraklatılabilir, sıraya alınabilir, saat kurularak zamanlanabilir. |
| Sitedeki videoyu kaydedemiyorum | Eklenti sayfadaki videoları ve HLS akışlarını bulur, üzerine **"İndir"** düğmesi koyar. |
| Giriş gerektiren siteden indirme başarısız | Tarayıcının çerezleri uygulamaya aktarılır, oturum açık siteler de çalışır. |

Reklam yok, hesap yok, veri toplama yok. Tamamen ücretsiz ve açık kaynak.

---

## ✨ Özellikler

<details open>
<summary><b>İndirme motoru</b></summary>

- **Çok bağlantılı indirme:** Dosya 32 bölüme kadar ayrılır (varsayılan 8 bağlantı).
- **Dinamik bölümleme:** İşini bitiren bağlantı, en çok işi kalan bölümün yarısını devralır; sonda tek bir yavaş bağlantıyı beklemezsiniz.
- **Kaldığı yerden devam:** Duraklatma, ağ kopması, uygulamanın kapanması, çökme veya elektrik kesintisinden sonra indirme kaldığı yerden sürer.
- **Otomatik yeniden deneme:** Kopan bağlantılar artan aralıklarla yeniden denenir; sunucunun `Retry-After` isteğine uyulur.
- **Sunucu sınırlarına uyum:** Sunucu fazla bağlantıyı reddederse (`429`/`503`) bağlantı sayısı kendiliğinden azaltılır.
- **Uykudan uyanınca toparlanma:** Bilgisayar uykudan uyanınca indirmeler hemen yeniden başlar.
- **Disk dostu:** Parçalar tek dosyaya doğrudan yazılır; sonda birleştirme yok, iki kat disk alanı gerekmez. Başlamadan önce boş alan kontrol edilir.
- **Süresi dolmuş bağlantıyı yenileme:** Yeni adresi yapıştırın, indirme kaldığı yerden sürsün.
- **Checksum doğrulama:** MD5, SHA-1, SHA-256, SHA-512.
- **Protokoller:** HTTP, HTTPS, FTP, FTPS ve HLS (m3u8) video.
- **Proxy:** Sistem ayarı, HTTP, HTTPS ve SOCKS5 (kullanıcı adı/şifreli).
- **Kimlik doğrulama:** Kullanıcı adı/şifre, çerez, Referer ve User-Agent.

</details>

<details open>
<summary><b>Tarayıcı entegrasyonu</b></summary>

- Tarayıcıdaki indirmeleri otomatik yakalar; çerezleri, Referer ve User-Agent bilgisini de aktarır.
- Uygulama kapalıysa indirme sessizce tarayıcıya bırakılır, **hiçbir indirme kaybolmaz**.
- Hangi dosya türlerinin yakalanacağı, en küçük dosya boyutu ve hariç tutulacak siteler ayarlanabilir.
- **Sağ tık menüsü:** "Gökçe Download Manager ile indir", "Bu medyayı indir", "Seçili bağlantıları indir", "Sayfadaki tüm bağlantıları indir".
- **Video yakalama:** Sayfadaki videolar algılanır, eklenti simgesinde sayıları görünür, videoların üzerinde "İndir" düğmesi çıkar.

</details>

<details open>
<summary><b>Kuyruk, zamanlayıcı ve otomasyon</b></summary>

- Aynı anda en fazla N indirme (genel ve kuyruk başına).
- Birden çok kuyruk; her biri için başlama/durma saati ve gün seçimi (ör. gece 02:00'de başla, 07:00'de dur).
- İndirmeler bitince **uyku, bilgisayarı kapatma veya uygulamadan çıkma** (60 sn geri sayımla, iptal edilebilir).
- Bitince özel bir komut çalıştırma (ör. virüs taraması).
- Genel ve indirme başına **hız sınırı**.
- İndirme sürerken bilgisayarın uykuya geçmesini engelleme.

</details>

<details open>
<summary><b>Arayüz</b></summary>

- Türkçe ve İngilizce; açık, koyu ve sistem teması.
- Kategoriler (Arşivler, Belgeler, Müzik, Video, Programlar, Resimler) ve her kategori için ayrı klasör.
- Arama, sıralama, çoklu seçim ve sağ tık menüsü.
- Ayrıntı panelinde canlı **bölüm haritası** ve **hız grafiği**.
- Toplu indirme: `resim[001-150].jpg` gibi desenler, adres listesi ve `.txt` dosyasından içe aktarma.
- Pano izleme: kopyaladığınız indirme bağlantısı otomatik yakalanır.
- Sürükle-bırak veya `Ctrl/Cmd + V` ile bağlantı ekleme.
- Sistem tepsisi / menü çubuğu simgesi, bildirimler, bilgisayar açılınca otomatik başlatma.

</details>

---

## 💻 Sistem gereksinimleri

| | En düşük |
| --- | --- |
| **Windows** | Windows 10 veya 11 (64 bit, x64 ya da ARM64) |
| **macOS** | macOS 12 Monterey veya üstü (Apple Silicon M1/M2/M3/M4 ya da Intel) |
| **Tarayıcı (isteğe bağlı)** | Chrome / Edge / Brave / Opera / Vivaldi 116+ veya Firefox 121+ |
| **Disk** | Yaklaşık 300 MB |

---

## 📦 Kurulum

Tüm kurulum dosyaları **[Releases (Sürümler) sayfasında](https://github.com/tngokce/downloadManager/releases/latest)** bulunur. Sayfanın altındaki **Assets** bölümünü açın ve bilgisayarınıza uygun dosyayı indirin:

| Bilgisayarınız | İndirmeniz gereken dosya |
| --- | --- |
| Windows (çoğu bilgisayar) | `Gokce-Download-Manager-X.Y.Z-Setup-x64.exe` |
| Windows (ARM işlemci, ör. Surface Pro X / Snapdragon) | `Gokce-Download-Manager-X.Y.Z-Setup-arm64.exe` |
| Windows, kurulum yapmadan kullanmak için | `Gokce-Download-Manager-X.Y.Z-Portable.exe` |
| Mac, Apple Silicon (M1, M2, M3, M4…) | `Gokce-Download-Manager-X.Y.Z-mac-arm64.dmg` |
| Mac, Intel işlemci | `Gokce-Download-Manager-X.Y.Z-mac-x64.dmg` |

> **Mac'imin işlemcisi hangisi?** Sol üstteki  menüsü → **Bu Mac Hakkında**. "Çip: Apple M…" yazıyorsa **arm64**, "İşlemci: Intel…" yazıyorsa **x64** dosyasını indirin.
>
> **Windows'um ARM mı?** Ayarlar → Sistem → Hakkında → **Sistem türü**. "ARM tabanlı işlemci" yazmıyorsa **x64** dosyasını indirin.

### Windows

1. `…-Setup-x64.exe` dosyasını indirip çift tıklayın.
2. **"Windows bilgisayarınızı korudu"** (SmartScreen) uyarısı çıkarsa: **Ek bilgi** → **Yine de çalıştır**'a tıklayın.
   <sub>Bu uyarı uygulama ücretli bir kod imzalama sertifikasıyla imzalanmadığı için çıkar; uygulamanın zararlı olduğu anlamına gelmez.</sub>
3. Kurulum sihirbazında kurulum klasörünü seçin (varsayılan uygundur) ve **Kur**'a tıklayın.
4. Masaüstündeki veya Başlat menüsündeki **Gökçe Download Manager** kısayoluyla uygulamayı açın.

**Portable (kurulumsuz) sürüm:** `…-Portable.exe` dosyasını istediğiniz klasöre koyup çift tıklamanız yeterlidir.

### macOS

1. Mac'inize uygun `.dmg` dosyasını indirip çift tıklayın.
2. Açılan pencerede **Gokce Download Manager** simgesini **Applications (Uygulamalar)** klasörüne sürükleyin.
   <sub>Mac'te dosya adı teknik bir kısıt nedeniyle Türkçe karaktersiz yazılır; Dock'ta ve uygulama içinde adı "Gökçe Download Manager" olarak görünür.</sub>
3. Uygulamalar klasöründen **Gökçe Download Manager**'ı açın.
4. İlk açılışta **"Apple, … uygulamasının kötü amaçlı yazılım içermediğini doğrulayamadı"** uyarısı çıkar. **Bitti**'ye tıklayın, sonra:
   1.  menüsü → **Sistem Ayarları** → **Gizlilik ve Güvenlik**'i açın.
   2. Sayfanın altında *"… engellendi"* uyarısının yanındaki **Yine de Aç**'a tıklayın ve parolanızı girin.
   3. Çıkan pencerede tekrar **Aç**'a tıklayın. Bu işlem yalnızca bir kez yapılır.

   <sub>Bu uyarı uygulama Apple'ın ücretli geliştirici programıyla imzalanmadığı (notarize edilmediği) için çıkar.</sub>

<details>
<summary><b>Alternatif: Terminal ile tek komutta açma</b></summary>

Yukarıdaki adımlar işe yaramazsa veya "hasarlı" uyarısı alırsanız Terminal'i açıp şu komutu çalıştırın, sonra uygulamayı normal şekilde açın:

```bash
xattr -dr com.apple.quarantine "/Applications/Gokce Download Manager.app"
```

</details>

---

## 🧩 Tarayıcı eklentisini kurma

Eklenti zorunlu değildir; ancak kurulursa tarayıcıdaki indirmeler otomatik olarak uygulamaya geçer ve videoların üzerinde "İndir" düğmesi çıkar.

> Eklenti henüz Chrome Web Store / Firefox Add-ons mağazalarında değildir; aşağıdaki gibi elle yüklenir. Yükleme bir kez yapılır, eklenti tarayıcı kapanıp açılsa da kalır.

### Chrome, Edge, Brave, Opera, Vivaldi

1. **Gökçe Download Manager**'ı açın.
2. **Ayarlar** (`Ctrl/Cmd + ,`) → **Tarayıcı** sekmesi → **Eklenti klasörünü aç**'a tıklayın. Bir klasör açılır (içinde `manifest.json` dosyası vardır).
3. Tarayıcınızın adres çubuğuna aşağıdakini yazıp Enter'a basın:

   | Tarayıcı | Adres |
   | --- | --- |
   | Chrome / Brave / Vivaldi | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Opera | `opera://extensions` |

4. Sayfanın sağ üstündeki (Edge'de sol alttaki) **Geliştirici modu** anahtarını açın.
5. **Paketlenmemiş öğe yükle** (*Load unpacked*) düğmesine tıklayın ve 2. adımda açılan klasörü seçin.
6. Tarayıcının araç çubuğundaki yapboz 🧩 simgesine tıklayıp **Gökçe Download Manager**'ı sabitleyin.
7. Eklenti simgesine tıklayın: **"Uygulamaya bağlı"** yazıyorsa kurulum tamamdır. ✅

> **İpucu:** Eklenti klasörünü Releases sayfasındaki `gokce-download-manager-chrome-X.Y.Z.zip` dosyasından da alabilirsiniz: zip'i bir klasöre çıkarıp 5. adımda o klasörü seçin. Bu klasörü silmeyin; tarayıcı eklentiyi oradan çalıştırır.

### Firefox

1. Releases sayfasından `gokce-download-manager-firefox-X.Y.Z.zip` dosyasını indirin.
2. Adres çubuğuna `about:debugging#/runtime/this-firefox` yazın.
3. **Geçici eklenti yükle…** düğmesine tıklayıp indirdiğiniz zip dosyasını seçin.
4. `about:addons` → **Gökçe Download Manager** → **İzinler** sekmesinden **"Tüm sitelerdeki verilerinize erişim"** iznini açın.

> Firefox, mağaza dışından yüklenen eklentileri tarayıcı kapanınca kaldırır. Kalıcı kullanım için eklentinin Firefox Add-ons mağazasında yayımlanması gerekir.

---

## 🚀 Kullanım

### İndirme eklemenin 5 yolu

1. **Tarayıcıdan:** Eklenti kuruluysa normal şekilde bir dosya indirin; indirme otomatik olarak uygulamaya geçer ve bir onay penceresi açılır.
2. **Adres ekle:** Uygulamadaki **+** düğmesi veya `Ctrl/Cmd + N` → adresi yapıştırın → **İndir**.
3. **Yapıştır:** Bir indirme bağlantısını kopyalayın, uygulama penceresinde `Ctrl/Cmd + V`'ye basın. (Pano izleme açıksa kopyalamanız yeterli.)
4. **Sürükle-bırak:** Bağlantıyı tarayıcıdan uygulama penceresine sürükleyin.
5. **Sağ tık:** Web sayfasındaki bir bağlantıya sağ tıklayıp **Gökçe Download Manager ile indir**'i seçin.

### Video indirme

Video oynatılan bir sayfada eklenti simgesinin üzerinde bulunan video sayısı görünür. Videonun üzerindeki **İndir** düğmesine veya eklenti simgesine tıklayıp listeden seçin.

### Toplu indirme

`Ctrl/Cmd + Shift + N` → bir desen yazın, ör. `https://site.com/resim[001-150].jpg` → 150 dosya tek seferde sıraya eklenir. Adres listesi yapıştırabilir veya `.txt` dosyasından içe aktarabilirsiniz.

### Zamanlama

Sol menüden bir kuyruk seçip **Zamanlayıcı**'yı açın; başlama/durma saatlerini ve günleri seçin. "Bitince bilgisayarı kapat" seçeneğiyle gece indirmeleri için idealdir.

---

## 🎬 Video (HLS) indirme ve ffmpeg

`.m3u8` (HLS) videoları ffmpeg olmadan da indirilir, ancak `.ts` olarak kaydedilir. **ffmpeg** kuruluysa ses ve görüntü tek bir `.mp4` dosyasında birleştirilir (isteğe bağlı):

- **Windows:** PowerShell'de `winget install Gyan.FFmpeg`
- **macOS:** Terminal'de `brew install ffmpeg` ([Homebrew](https://brew.sh) gerekir)

Uygulama ffmpeg'i otomatik bulur. Bulamazsa yolunu **Ayarlar → Video** bölümünden elle girebilirsiniz.

> DRM korumalı içerikler (Netflix, Disney+, Spotify vb.) ve canlı yayınlar desteklenmez. Lütfen yalnızca indirme hakkınız olan içerikleri indirin.

---

## ⌨️ Klavye kısayolları

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
| `Delete` (macOS: `⌫`) | Listeden sil (`Shift` ile dosyayla birlikte) |
| `↑ / ↓` | Satırlar arasında gezin |

---

## 🔒 Gizlilik ve güvenlik

- **Veri toplama yok:** Uygulama ve eklenti hiçbir analitik, reklam veya takip kodu içermez; hiçbir bilgiyi bir sunucuya göndermez. Uygulama yalnızca indirdiğiniz dosyanın sunucusuna bağlanır.
- **Eklenti yalnızca kendi bilgisayarınızla konuşur:** Eklenti, indirme bilgilerini yalnızca aynı bilgisayarda çalışan uygulamaya (`127.0.0.1`) iletir. Bu yerel köprü ağdaki diğer cihazlara kapalıdır ve web sitelerinden gelen istekleri reddeder.
- **Uygulama güvenliği:** Arayüz yalıtılmış (sandbox) çalışır, sıkı İçerik Güvenlik Politikası uygulanır, dosya adları zararlı karakterlerden temizlenir.
- **Yerelde saklanan bilgiler:** Giriş gerektiren indirmelerin sonradan devam edebilmesi için indirmeye ait çerez/şifre başlıkları ve (girdiyseniz) proxy şifresi, yalnızca sizin bilgisayarınızdaki veri klasöründe saklanır. Paylaşılan bir bilgisayardaysanız tamamlanan indirmeleri listeden silebilirsiniz.
- **Eklenti izinleri** ve nedenleri: [docs/EKLENTI.md](docs/EKLENTI.md#i̇zinler-ve-nedenleri)

Bir güvenlik açığı bulduysanız lütfen herkese açık issue açmak yerine [SECURITY.md](SECURITY.md) dosyasındaki yolu izleyin.

---

## 📁 Veriler nerede saklanır?

| Platform | Konum |
| --- | --- |
| Windows | `%APPDATA%\Gökçe Download Manager\` |
| macOS | `~/Library/Application Support/Gökçe Download Manager/` |

Bu klasörde `downloads.json` (indirme listesi ve ilerleme), `settings.json`, `queues.json` ve `window.json` bulunur. İndirilen dosyaların kendisi **Ayarlar**'da seçtiğiniz klasöre (varsayılan: İndirilenler) kaydedilir.

---

## 🗑️ Kaldırma

- **Windows:** Ayarlar → Uygulamalar → **Gökçe Download Manager** → Kaldır. Ayarları da silmek için yukarıdaki veri klasörünü silin.
- **macOS:** Uygulamalar klasöründeki **Gokce Download Manager**'ı Çöp Sepeti'ne sürükleyin. Ayarları da silmek için `~/Library/Application Support/Gökçe Download Manager/` klasörünü silin.
- **Eklenti:** Tarayıcının eklentiler sayfasından **Kaldır**.

---

## ❓ Sık sorulan sorular

<details>
<summary><b>Ücretsiz mi? Reklam var mı?</b></summary>

Tamamen ücretsiz ve açık kaynaktır (MIT lisansı). Reklam, hesap veya abonelik yoktur.
</details>

<details>
<summary><b>Windows/macOS neden "tanınmayan uygulama" uyarısı veriyor?</b></summary>

Uyarıyı kaldırmak için ücretli kod imzalama sertifikaları (Apple Developer, Windows EV sertifikası) gerekir. Uygulamanın tüm kaynak kodu bu depoda açıktır ve kurulum dosyaları doğrudan bu koddan GitHub Actions ile otomatik derlenir. Kurulum adımlarındaki talimatlarla uyarıyı bir kez geçmeniz yeterlidir.
</details>

<details>
<summary><b>Eklenti "Uygulama çalışmıyor" diyor.</b></summary>

Gökçe Download Manager'ın açık olduğundan emin olun (pencereyi kapatsanız da tepside / menü çubuğunda çalışmaya devam eder). Ayarlar → Tarayıcı bölümünde **tarayıcı entegrasyonunun açık** olduğunu kontrol edin. Güvenlik duvarı programınız `127.0.0.1` üzerindeki yerel bağlantıları engelliyorsa izin verin.
</details>

<details>
<summary><b>Bazı indirmeleri tarayıcıda bırakmak istiyorum.</b></summary>

Ayarlar → Tarayıcı bölümünden yakalanacak dosya uzantılarını, en küçük dosya boyutunu ve hariç tutulacak siteleri belirleyin. Eklenti penceresinden yakalamayı geçici olarak da kapatabilirsiniz.
</details>

<details>
<summary><b>İndirme %99'da kaldı / hata verdi.</b></summary>

Çoğu zaman indirme bağlantısının süresi dolmuştur. İndirmeye sağ tıklayıp **Adresi yenile…**'yi seçin, sitedeki indirme bağlantısını yeniden kopyalayıp yapıştırın; indirme kaldığı yerden sürer.
</details>

<details>
<summary><b>YouTube videolarını indirebilir miyim?</b></summary>

YouTube'un parça parça akış biçimi desteklenmez. Uygulama doğrudan video dosyalarını ve HLS (`.m3u8`) akışlarını indirir.
</details>

---

## 🛠️ Sorun giderme

| Belirti | Çözüm |
| --- | --- |
| macOS: "hasarlı, Çöp Sepeti'ne taşıyın" | Terminal'de `xattr -dr com.apple.quarantine "/Applications/Gokce Download Manager.app"` |
| macOS: "doğrulanamadı" | Sistem Ayarları → Gizlilik ve Güvenlik → **Yine de Aç** |
| Windows: SmartScreen uyarısı | **Ek bilgi** → **Yine de çalıştır** |
| İndirme çok yavaş | İndirmeyi seçip ayrıntı panelinden bağlantı sayısını artırın; hız sınırının kapalı olduğundan emin olun. |
| Sunucu "çok fazla istek" (429) veriyor | Uygulama bağlantı sayısını otomatik düşürür; isterseniz o indirme için bağlantı sayısını 1-2'ye indirin. |
| Video `.ts` olarak kaydedildi | [ffmpeg](#-video-hls-indirme-ve-ffmpeg) kurun. |

Sorununuz burada yoksa lütfen bir **[issue açın](https://github.com/tngokce/downloadManager/issues/new/choose)**.

---

## 👩‍💻 Geliştiriciler için: kaynaktan derleme

**Gereksinim:** [Node.js](https://nodejs.org) 22.12+ (24 önerilir) ve Git.

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
| `npm run icons` | `resources/logo.png` dosyasından tüm simgeleri yeniden üretir |

**Sürüm çıkarma:** `v1.2.3` gibi bir etiket gönderildiğinde GitHub Actions macOS ve Windows paketlerini derleyip otomatik olarak bir GitHub Release'e ekler:

```bash
npm version patch            # package.json sürümünü artırır ve etiket oluşturur
git push --follow-tags
```

Teknoloji: Electron, TypeScript, React, undici, basic-ftp. Ayrıntılı belgeler:

- [docs/MIMARI.md](docs/MIMARI.md): Mimari, indirme motoru, güvenlik
- [docs/EKLENTI.md](docs/EKLENTI.md): Tarayıcı eklentisi
- [docs/GELISTIRME.md](docs/GELISTIRME.md): Geliştirme, test, imzalama, sürüm çıkarma

---

## 🤝 Katkıda bulunma

Hata bildirimleri, öneriler ve pull request'ler memnuniyetle karşılanır. Başlamadan önce [CONTRIBUTING.md](CONTRIBUTING.md) dosyasını okuyun. Tüm katılımcıların [Davranış Kuralları](CODE_OF_CONDUCT.md)'na uyması beklenir.

Değişiklik geçmişi: [CHANGELOG.md](CHANGELOG.md)

## 📄 Lisans

[MIT](LICENSE) © 2026 Tunahan Gökçe
