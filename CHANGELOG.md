# Değişiklik Günlüğü

Bu projedeki tüm önemli değişiklikler bu dosyada belgelenir.
Biçim [Keep a Changelog](https://keepachangelog.com/tr-TR/1.1.0/) esas alınır ve proje [Anlamsal Sürümleme](https://semver.org/lang/tr/) kullanır.

## [1.0.0] - 2026-11-14

İlk herkese açık sürüm.

### Eklenenler
- Çok bağlantılı (32 bölüme kadar), dinamik bölümlemeli indirme motoru
- Kaldığı yerden devam, otomatik yeniden deneme, uykudan uyanınca toparlanma
- HTTP, HTTPS, FTP, FTPS ve HLS (m3u8) desteği; ffmpeg ile mp4'e dönüştürme
- Chrome, Edge, Brave, Opera, Vivaldi ve Firefox için tarayıcı eklentisi (indirme yakalama, video algılama, sağ tık menüleri)
- Kuyruklar, zamanlayıcı, hız sınırı, bitince uyku/kapatma
- Toplu indirme, pano izleme, sürükle-bırak, `dlmanager://` protokolü
- Checksum doğrulama (MD5, SHA-1, SHA-256, SHA-512), proxy desteği
- Türkçe ve İngilizce arayüz; açık/koyu tema
- Windows (x64, ARM64; kurulum ve portable) ve macOS (Apple Silicon, Intel) paketleri

### Değişenler
- Uygulamanın adı **Gökçe Download Manager** oldu ve yeni logo eklendi. Önceki "Download Manager" sürümünün indirme listesi ve ayarları ilk açılışta otomatik olarak taşınır.

[1.0.0]: https://github.com/tngokce/downloadManager/releases/tag/v1.0.0
