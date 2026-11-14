# API Sözleşmesi: Bayi Başvurusu ve Admin Onay Akışı

Gereksinimler: GR-BAYI-001…008, GR-KVK-001, K-02 – K-08, K-12, K-35, K-43, K-45, K-51.
Tüm uçlar `/api` önekli, JSON gövde, oturum httpOnly çerezle (kimlik doğrulama adımındaki gibi).
Hata gövdesi: `{ statusCode, message, code? }`. Frontend `message`'ı göstermez; `code` ile ayırt eder.

## Akış

1. **Başvuru (K-02, K-35):** Aday `/basvuru` formunu doldurur → bayi `pending_email` olarak kaydedilir
   → doğrulama e-postası gider (24 saat, K-55). 24 saatte doğrulanmayan kayıt e-posta/unvanı
   kilitlemez: aynı e-posta veya unvanla yeni başvuru eskisini siler ve kabul edilir (günlük temizlik de
   aynısını yapar).
2. **E-posta doğrulama (K-03):** `/eposta-dogrula?token=` → `pending_approval`. (Mevcut uç.) Bu anda
   aktif Admin'lere "yeni başvuru" e-postası gider (GR-BAYI-001'den bilinçli sapma: bildirim başvuruda
   değil doğrulamada; doğrulanmamış/spam başvurular ekibe gitmez).
3. **Admin onayı (K-04):** Admin onaylar → `active` olur ve bayiye **şifre belirleme (davet) e-postası**
   gider (`invitation` token, 72 saat). Bayi şifresini belirleyince giriş yapabilir.
   Admin reddederse gerekçe zorunlu (iç not) → `rejected` (K-51: aynı bilgilerle yeniden başvurabilir);
   aday gerekçesiz bir bilgi e-postası alır.
4. **Davetle hesap (K-02):** Admin başvuru olmadan bayi oluşturur → doğrudan `active` + davet e-postası.
5. **Pasife alma / aktif etme (K-08):** Admin, gerekçeyle.
6. **İskonto (K-12, K-43):** Admin genel iskonto oranını belirler. Ürün grubu iskontoları ürün kataloğu
   adımında (gruplar o adımda oluşturulacak).

Şifresi henüz belirlenmemiş aktif bayi giriş yapamaz (genel 401).

## Herkese açık uçlar

### `POST /api/applications` — başvuru (hız sınırlı)
```json
{
  "companyTitle": "Örnek Züccaciye Ltd. Şti.",
  "contactName": "Ayşe Yılmaz",
  "email": "ayse@ornek.com",
  "phone": "05321234567",
  "city": "Kayseri",
  "district": "Melikgazi",
  "address": "Atatürk Cad. No:12",
  "consents": { "kvkk": true, "terms": true, "marketing": false }
}
```
- `kvkk` ve `terms` `true` olmak zorunda (GR-KVK-001); `marketing` isteğe bağlı.
- Telefon: boşluk, tire, parantez ve `+` atılır; `90` ile başlayan 12 hane ise baştaki `90`, 11 hane
  ise baştaki `0` atılır. Kalan 10 hane `[2-5]` ile başlamalı; `0XXXXXXXXXX` (11 hane) olarak saklanır.
  Örn. `+90 532 123 45 67`, `0532...`, `532...` → `05321234567`; `12345678901` reddedilir (400).
- Firma unvanı iç boşlukları tek boşluğa indirilerek saklanır; tekillik Türkçe büyük/küçük harf ve
  boşluk farkından bağımsızdır ("ÖRNEK ZÜCCACİYE" = "Örnek  Züccaciye").
- Yanıt **202** `{}` (her durumda aynı gövde).
- Aynı e-posta veya firma unvanıyla aktif/bekleyen kayıt varsa **409** `{ code: "DUPLICATE_APPLICATION" }`.
  (Bilinçli karar: başvuru formunda tekrarı açıkça söylemek kullanıcı için gerekli; e-posta sızıntısı
  riski kabul edilmiştir. Hız sınırı uygulanır.)
- Doğrulama hatası **400** `{ code: "VALIDATION", fields: { alan: "mesaj" } }`.
- Onaylar `consents` tablosuna metin sürümüyle yazılır. Metin sürümü şimdilik `taslak-1`
  (KVKK ve koşul metinleri iş sahibinden gelecek).

### `POST /api/auth/invitation/accept` — davetle şifre belirleme (hız sınırlı)
```json
{ "token": "...", "password": "...", "consents": { "kvkk": true, "terms": true, "marketing": false } }
```
→ **204**; geçersiz/süresi dolmuş/kullanılmış token ya da pasifleşmiş bayi **400**.
`kvkk` ve `terms` `true` olmak zorunda (K-57, GR-KVK-001) aksi halde **400** `{ code: "VALIDATION", fields }`
(`consents.kvkk`, `consents.terms`). Onaylar şifreyle aynı transaction'da `consents`'e yazılır (`taslak-1`);
bayinin o tür için zaten onaylı kaydı varsa (başvurudan gelen) tekrar yazılmaz.
Şifre K-53 kuralına uyar. Başarıda bayi otomatik giriş yapmaz; giriş sayfasına yönlendirilir.

### Arayüz bağlantıları (e-postalarda)
- Doğrulama: `${APP_URL}/#/eposta-dogrula?token=...` (mevcut)
- Davet / şifre belirleme: `${APP_URL}/#/davet?token=...`

## Admin uçları (AdminGuard)

Bayi özeti (`DealerSummary`):
```json
{
  "id": "uuid",
  "companyTitle": "...", "contactName": "...", "email": "...", "phone": "...",
  "city": "...", "district": "...",
  "status": "pending_email | pending_approval | active | rejected | passive",
  "source": "application | invitation",
  "hasPassword": true,
  "generalDiscountPercent": "10.00" | null,
  "createdAt": "ISO", "reviewedAt": "ISO" | null, "lastLoginAt": "ISO" | null,
  "approvalOverdue": false
}
```
`approvalOverdue`: `pending_approval` durumunda ve e-posta doğrulamasından bu yana **2 iş günü** geçtiyse
`true` (K-04; hafta sonu sayılmaz, resmî tatiller şimdilik sayılır).

### `GET /api/admin/dealers?status=&q=&page=1&pageSize=20`
- `status` boşsa hepsi; `q` firma unvanı, yetkili adı veya e-postada arar (büyük/küçük harf duyarsız).
- Sıralama: `pending_approval` önce, sonra en yeni.
- Yanıt `{ items: DealerSummary[], total, page, pageSize }`.

### `GET /api/admin/dealers/summary`
`{ pendingApproval: 3, overdue: 1, pendingEmail: 2, active: 40, passive: 1 }` — panel ana sayfası için.

### `GET /api/admin/dealers/:id`
`DealerSummary` + `{ address, emailVerifiedAt, rejectionReason, consents: [{ type, granted, documentVersion, createdAt }], history: [{ action, reason, actor, createdAt }] }`
(`history` audit_log'dan, en yeni önce.)

### Durum işlemleri (hepsi 204; geçersiz durumda **409** `{ code: "INVALID_STATE" }`)
- `POST /api/admin/dealers/:id/approve` — yalnızca `pending_approval` → `active` + davet e-postası.
- `POST /api/admin/dealers/:id/reject` `{ reason }` — `pending_email` veya `pending_approval` → `rejected`. Gerekçe zorunlu (en az 3 karakter); iç nottur, adaya giden e-postada yer almaz (e-posta: başvurunuz onaylanmadı, bilgi için iletişim, yeniden başvurabilirsiniz).
- `POST /api/admin/dealers/:id/deactivate` `{ reason }` — `active` → `passive`; açık oturumları silinir.
- `POST /api/admin/dealers/:id/activate` `{ reason? }` — `passive` → `active`.
- `POST /api/admin/dealers/:id/resend-invitation` — `active` ve şifresi yoksa yeni davet e-postası (önceki geçersiz olur).

### `POST /api/admin/dealers` — davetle bayi oluştur
Başvuru alanları (consents hariç) → **201** `DealerSummary` (`source: invitation`, `status: active`, `hasPassword: false`) + davet e-postası. Tekrar varsa **409** `DUPLICATE_APPLICATION`.

### `PATCH /api/admin/dealers/:id/terms` `{ generalDiscountPercent: "10" | null }`
0 < oran < 100, en fazla 2 ondalık; `null` iskontoyu kaldırır (standart liste fiyatı). **204**.
Yalnızca `pending_approval`, `active`, `passive` durumlarında; diğerlerinde **409** `INVALID_STATE`.
Önceki ve yeni değer audit_log'a yazılır.

Tüm Admin işlemleri audit_log'a yazılır (işlemi yapan Admin, zaman, gerekçe).

## Bildirimler (K-04 hatırlatma)

- Yeni başvuru: bayi e-postasını doğruladığında tüm aktif Admin'lere (arka planda).
- Hatırlatma: hafta içi her gün 09:00'da (Europe/Istanbul) onay bekleyen başvurulardan en az biri
  1 iş günü geçmiş (yaklaşan) veya 2 iş gününü aşmışsa (gecikmiş) aktif Admin'lere iki sayıyla e-posta.
- İş günü hesabı Europe/Istanbul'a göredir (Türkiye sabit UTC+3); hafta sonu sayılmaz, resmî tatiller şimdilik sayılır.
- Zamanlanmış işler (hatırlatma, günlük temizlik) çok örnekli çalışmada PostgreSQL advisory lock ile tek örnekte koşar.
- Davet e-postası token'ı bayi satırı kilitliyken üretilir; paralel "yeniden gönder"de yalnızca sonuncusu geçerlidir.

Geliştirmede e-postalar log'a yazılır.
