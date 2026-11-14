# Güvenlik Politikası / Security Policy

## Desteklenen sürümler

Güvenlik düzeltmeleri yalnızca [en son sürüm](https://github.com/tngokce/downloadManager/releases/latest) için yayımlanır.

| Sürüm | Destek |
| --- | --- |
| 1.x (en son) | ✅ |
| Daha eski | ❌ |

## Açık bildirme

Lütfen güvenlik açıklarını **herkese açık issue olarak bildirmeyin.**

Bunun yerine GitHub'ın gizli bildirim özelliğini kullanın: depo sayfasında **Security** sekmesi → **Report a vulnerability**. ([doğrudan bağlantı](https://github.com/tngokce/downloadManager/security/advisories/new))

Bildiriminizde şunlar olsun:

- Etkilenen sürüm ve işletim sistemi
- Açığın türü ve etkisi (ör. uzaktan bir web sayfasının indirme başlatabilmesi, dosyanın seçilen klasör dışına yazılması)
- Adım adım tekrarlama yolu veya kavram kanıtı

Bildirimler en geç 7 gün içinde yanıtlanır. Düzeltme yayımlandıktan sonra, isterseniz katkınız sürüm notlarında belirtilir.

*Please report vulnerabilities privately via **Security → Report a vulnerability** rather than in a public issue.*

## Kapsam

Özellikle şu alanlardaki bulgular önemlidir:

- **Yerel köprü** (`127.0.0.1` üzerindeki HTTP sunucusu): bir web sitesinin veya ağdaki başka bir cihazın uygulamaya istek gönderebilmesi
- **Tarayıcı eklentisi:** çerezlerin veya sayfa verisinin uygulama dışına sızması
- **Dosya sistemi:** dosya adları üzerinden seçilen klasör dışına yazma (path traversal)
- **Electron:** arayüzden Node.js erişimi, IPC doğrulama eksikleri, uzak içerik yükleme
- `dlmanager://` protokol işleyicisi

## Bilinen tasarım kararları

- Kimlik doğrulamalı indirmelerin devam edebilmesi için indirmenin çerez/yetki başlıkları ve proxy şifresi, kullanıcının kendi veri klasöründeki JSON dosyalarında saklanır. Bilgisayara yerel erişimi olan bir kişi bu dosyaları okuyabilir.
- Yerel köprü, aynı bilgisayarda çalışan diğer programlardan gelen istekleri ayırt edemez; bu programlar en fazla bir indirme penceresi açabilir. Ayarlar → Tarayıcı'daki "Tarayıcıdan gelen indirmede onay penceresi göster" seçeneği açık tutulursa her indirme kullanıcı onayı gerektirir.
- Paketler ücretli sertifikalarla imzalanmamıştır; kurulum dosyalarını yalnızca bu deponun [Releases](https://github.com/tngokce/downloadManager/releases) sayfasından indirin.
