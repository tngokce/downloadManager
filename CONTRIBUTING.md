# Katkıda Bulunma Rehberi

Gökçe Download Manager'a katkıda bulunmak istediğiniz için teşekkürler! 🎉
*English speakers are welcome too — issues and PRs may be written in English.*

## Hata bildirme

1. Önce [mevcut issue'lara](https://github.com/tngokce/downloadManager/issues) bakın; aynı sorun bildirilmiş olabilir.
2. [Yeni issue](https://github.com/tngokce/downloadManager/issues/new/choose) açarken **Hata bildirimi** şablonunu doldurun:
   - İşletim sistemi ve sürümü, uygulama sürümü (Ayarlar → Hakkında), tarayıcı ve sürümü
   - Adım adım nasıl tekrarlanacağı, beklenen ve gerçekleşen davranış
3. **Kişisel bilgi paylaşmayın:** Çerez, şifre, oturum bağlantısı (token içeren URL) veya özel dosya adreslerini issue'ya yazmayın.

Güvenlik açıkları için issue açmayın, [SECURITY.md](SECURITY.md) dosyasını izleyin.

## Özellik önerme

**Özellik isteği** şablonunu kullanın; hangi sorunu çözdüğünü ve nasıl çalışmasını beklediğinizi anlatın.

## Kod katkısı

### Ortamı kurma

```bash
git clone https://github.com/<kullanıcı-adınız>/downloadManager.git
cd downloadManager
npm install
npm run dev
```

Gereksinim: Node.js 22.12+ (24 önerilir).

### Akış

1. Depoyu fork'layın ve `main` dalından yeni bir dal açın: `git checkout -b duzeltme/kisa-aciklama`
2. Değişikliğinizi yapın. Yeni davranışlar için `tests/` altına test ekleyin.
3. Göndermeden önce şunların hepsi başarılı olmalı:
   ```bash
   npm run typecheck
   npm test
   ```
4. Anlaşılır commit mesajları yazın (ör. `motor: 416 yanıtında yeniden denemeyi düzelt`).
5. Pull request açın ve şablondaki kontrol listesini doldurun.

### Kod kuralları

- TypeScript `strict` modunda yazılır; `any` kullanmaktan kaçının.
- Kullanıcıya görünen her metin `src/shared/i18n.ts` dosyasına **hem Türkçe hem İngilizce** eklenir; eklenti metinleri `extension/_locales/` altına.
- Ana süreç (main) ile arayüz (renderer) yalnızca `src/preload` üzerinden konuşur; arayüze Node.js erişimi verilmez.
- Tarayıcı köprüsü (`src/main/bridge.ts`) ve IPC'ye gelen her veri doğrulanmalıdır.
- Biçim: `.editorconfig` (2 boşluk, LF).

Mimari için [docs/MIMARI.md](docs/MIMARI.md), geliştirme ayrıntıları için [docs/GELISTIRME.md](docs/GELISTIRME.md) dosyalarına bakın.

## Davranış kuralları

Bu projeye katılan herkesin [Davranış Kuralları](CODE_OF_CONDUCT.md)'na uyması beklenir.

## Lisans

Gönderdiğiniz katkılar projenin [MIT lisansı](LICENSE) altında yayımlanır.
