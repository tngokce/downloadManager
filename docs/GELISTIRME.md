# Geliştirme

## Klasör yapısı

```
downloadManager/
├── src/
│   ├── main/            Ana süreç (Electron)
│   │   ├── engine/      İndirme motoru (Electron'dan bağımsız)
│   │   ├── index.ts     Uygulama denetleyicisi: pencereler, tepsi, menü
│   │   ├── ipc.ts       Arayüz çağrıları
│   │   ├── manager.ts   Liste, kuyruklar, eşzamanlılık
│   │   ├── bridge.ts    Tarayıcı eklentisi köprüsü
│   │   ├── scheduler.ts Zamanlayıcı
│   │   ├── system.ts    ffmpeg bulma, uyku/kapatma, açılışta başlatma
│   │   └── store.ts     Atomik JSON kayıt
│   ├── preload/         Güvenli IPC köprüsü (window.api)
│   ├── renderer/        React arayüzü
│   └── shared/          Ortak tipler, varsayılanlar, dil dosyası
├── extension/           Tarayıcı eklentisi
├── resources/           Simgeler (SVG kaynakları + üretilmiş PNG'ler)
├── scripts/             Simge ve eklenti paketleme betikleri
├── tests/               Vitest testleri
├── docs/                Belgeler
└── .github/workflows/   CI: test + macOS/Windows paketleme + sürüm
```

## Testler

```bash
npm test
```

Testler gerçek bir yerel HTTP sunucusuna (`tests/helpers.ts`) karşı çalışır. Sunucu şunları taklit edebilir: Range desteği olmaması, rastgele kopan bağlantılar, bağlantı sınırı (429), bağlantı başına hız sınırı, chunked yanıt, yönlendirme ve AES şifreli HLS. Her indirme testi sonucu SHA-256 ile orijinal veriyle karşılaştırır.

| Dosya | Kapsam |
| --- | --- |
| `units.test.ts` | Bölümleme algoritması, dosya adı çözümleme, desen genişletme, boyut okuma |
| `engine.test.ts` | Yoklama, çok bağlantı, duraklat/devam, kopan bağlantılar, 429 uyumu, chunked, aynı ad, 404, hız sınırı, HLS |
| `manager.test.ts` | Kuyruk, eşzamanlılık sınırı, duraklat/sürdür, checksum, kapanış ve yeniden açılışta sürdürme |
| `bridge.test.ts` | Köprü güvenliği (Origin/Host), toplu bağlantılar, zamanlayıcı |

## Yeni dil eklemek

1. `src/shared/i18n.ts` dosyasına yeni bir sözlük ekleyin. TypeScript eksik anahtarları derleme sırasında yakalar.
2. `Language` tipine ve Ayarlar → Genel'deki dil listesine ekleyin.
3. Eklenti için `extension/_locales/<dil>/messages.json` dosyasını oluşturun.

## Sürüm çıkarma

1. `package.json` dosyasındaki `version` değerini artırın (eklenti sürümü paketlenirken buradan alınır).
2. Değişiklikleri gönderin:
   ```bash
   git commit -am "v1.1.0" && git tag v1.1.0 && git push --follow-tags
   ```
3. GitHub Actions testleri çalıştırır, macOS ve Windows paketlerini üretir, eklenti zip'leriyle birlikte bir GitHub Release oluşturur.

## Kod imzalama (isteğe bağlı)

- **macOS:** Apple Developer ID sertifikası (`.p12`) base64 olarak `CSC_LINK` secret'ına, şifresi `CSC_KEY_PASSWORD` secret'ına yazılır. Notarization için ayrıca `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` ve `APPLE_TEAM_ID` gerekir.
- **Windows:** Kod imzalama sertifikası aynı değişkenlerle verilir.

İmzasız paketler de çalışır; ilk açılıştaki uyarıyı geçme adımları README'de anlatılıyor.
