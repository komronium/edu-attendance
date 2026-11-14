# attendance · Re-design, Re-UI, Re-UX

Holat: **asosan bajarilgan** · 2026-11-14 · `next-version` shoxi, `c6c60c2` dan keyin.

Qarorlar (egasi «boshla» dedi; tavsiya etilgan variantlar olindi): Q1 sidebar och · Q2 Reja Jadvalning «Ro'yxat» ko'rinishi · Q3 matn 15px.
Bajarilgan: **0-bosqich** (`web/css/tokens.css`, och sidebar, `theme.js` bilan bitta dark blok) va **1-bosqich** (7 bandli sidebar,
yangi manzillar + eski alias'lar, sahifa ichidagi `subnav`, Ctrl K buyruqlari, mavzu Sozlamalarda). **2-bosqich** (yo'qlama: kelgan — jim `✓`, kelmagan — qizil `✕ Kelmadi`; baho ustuni faqat kerak bo'lganda; 1200px dan ikki ustun, 18 talaba 1280×720 ga sig'adi;
`Ctrl+Enter` tugatadi, ↑/↓ yuradi), **3-bosqich** (Bugun: sahifa yarmiga qisqardi, to'rt kartochka va to'rt plitka o'rniga bitta jim qator `.facts-strip`;
«E'tibor talab qiladi» → «Navbat») va **4-bosqich qisman** (Jadval: ustma-ust banneri bir qatorli `.notice-line`, hafta sarlavhasidan muammo sonlari olib tashlandi,
«Keyingi dars» va «davomat olinmagan» kartochka emas qator, kataklardagi qizil hoshiya yo'q). **5-bosqich** (Guruh: Darslar — bitta asosiy tugma sarlavhada, «Boshqa sana» varaqda, yon ustun va 4 plitka yo'q; Qarzlar — chap ro'yxat o'rniga qidiruv;
yangi **Mavzular** tabi `#/guruh/mavzular` — «Kurs rejasi» Reja sahifasidan ko'chdi). **6-bosqich** (Yuklama: bitta son + hukm + chiziq + bashorat gapi, Ma'ruza/Amaliy/Oxirigacha bitta jim qator, qolgan bashoratlar «Batafsil» ostida;
Ustama: `0% / +0% / 0% / 0/5` to'rtligi o'rniga bitta yetakchi gap, jarimalar va tarix pastda yopiq; Ilmiy KPI: plitkalar va bo'sh «Ishlarim» kartochkasi o'rniga bitta yetakchi gap).
**7-bosqich** (Sozlamalar bitta 720px ustun, «Hisob» bo'limi; kirish sahifasi yangi tokenlarda) va **8-bosqich qisman** (ishlatilmagan CSS qoidalari olib tashlandi, `DESIGN.md` qayta yozildi). Qilinmadi: `app.js`/`app.css` ni `views/`/`ui/` fayllariga bo'lish (xavf/foyda nisbati sabab alohida ishga qoldirildi), setka ≤ 200px.

Bu hujjat interfeysni qayta qurish uchun yagona manba: nima o'zgaradi, nega, qanday ko'rinadi va
qaysi tartibda quriladi. Egasining ruxsati: **90% gacha qayta tuzish mumkin** (navigatsiya, sahifalar,
ko'rinish, front-end kodi tuzilmasi). Qolgan 10% — 2-bo'limdagi qulflangan narsalar.

U `docs/REDESIGN_PROMPT.md` ni (uslub qoladi, faqat UX) va `docs/audit/09_UI_UX_REDESIGN_SPEC.md` ni
(Sokin yo'nalishini sayqallash) almashtiradi. Tasdiqlangach `DESIGN.md` shu hujjatdan qayta yoziladi.

---

## 0. Qisqacha

| | Hozir | Keyin |
|---|---|---|
| Navigatsiya | 11 band, 4 guruh, ma'lumot manbasi bo'yicha | **7 band**, ish lahzasi bo'yicha |
| Bosh sahifa | 9 blok (hero, e'tibor, 3 kartochka, 4 plitka), bir son 3 joyda | **3 zona**: Hozir · Navbat · Bugun, pastida bitta jim qator |
| Yuza | hamma narsa oq kartochka, kulrang fonda | **kartochkasiz**: zamin + ingichka chiziq; kartochka faqat "narsa" uchun |
| Sidebar | to'q navy, ekrandagi eng og'ir narsa | och, jim; og'irlik kontentda |
| Qizil rang | bir haftalik jadvalda 10+ qizil yozuv, 3 sahifada bir xil qizil banner | qizil = faqat hozir bosiladigan narsa; har muammo to'liq holda **bir joyda** |
| Kod | `app.js` 2299 qator, `app.css` 910 qator | `ui/` · `views/` · `css/` qatlamlari, build yo'q |

Ochiq qarorlar (egasi hal qiladi; javob bo'lmasa birinchi variant bilan ketiladi):

- **Q1. Sidebar rangi.** (a) och, zamin bilan bir oilada — tavsiya: Apple Reminders / Vercel / Linear shunday, kontent yetakchi bo'ladi; (b) navy qoladi (2026-11-13 dagi qaror) — tokenlar ikkalasini ham ko'taradi, farq bitta blok.
- **Q2. "Dars rejasi" alohida sahifa bo'lib qolishi.** (a) Jadvalning "Ro'yxat" ko'rinishiga qo'shiladi — tavsiya; (b) alohida band qoladi.
- **Q3. Matn o'lchami.** (a) 15px qoladi — tavsiya, sinfda noutbukdan o'qiladi; (b) 14px, zichroq.

---

## 1. Tashxis (2026-11-14 dagi skrinshotlar, demo `--with-site`, 1440×900 va 1920×1080)

| # | Ko'rilgan narsa | Qayerda | Daraja |
|---|---|---|---|
| T1 | Bir son bir ekranda uch marta: `26.4%` / `86 soat` / `108 soat orqada` (E'tibor, Semestr sur'ati, plitka); "olinmagan davomat" ham uch marta | Bosh sahifa | P1 |
| T2 | Ustma-ust dars haqidagi katta qizil banner uch sahifada bir xil matn bilan | Bosh sahifa, Jadval, Reja | P1 |
| T3 | Jadval setkasi 430px dan boshlanadi: undan oldin sarlavha (5 ta son), "Keyingi dars", qizil banner, "23 ta darsda…" bandi | Jadval | P1 |
| T4 | Haftada 10 ta qizil `Olinmagan` + qizil hoshiya: qizil "hozir harakat" ma'nosini yo'qotadi | Jadval | P1 |
| T5 | Darslar haqida 3 band (Dars jadvali, Dars rejasi, Darslar), tizim haqida 2 band (Bildirishnomalar, Kabinet); mavzu tugmasi sidebar'da joy egallaydi | Sidebar | P1 |
| T6 | Har bo'lim bir xil og'irlikdagi oq kartochka: ko'z qayerdan boshlashni bilmaydi; "kartochkalar qatori" shablon tuyg'usi | Bosh sahifa, Yuklama, Darslar, KPI | P2 |
| T7 | Plitkalarda ish bermaydigan sonlar: `0%`, `+0%`, `0%`, `0 / 5` bir qatorda; `Ilmiy ball 6.00` izohsiz | Ustama, Bosh sahifa | P2 |
| T8 | Sarlavha ostida 4–5 ta son (17 ta dars · 34 soat · 17 ta o'tildi · 10 ta davomatsiz · 1 ta ustma-ust) | Jadval, Qarzlar, Reja | P2 |
| T9 | Ikki bir xil forma ("Bugun" va "Boshqa sana") ikkalasi ham davomat boshlaydi | Darslar | P2 |
| T10 | Bo'sh joy: KPI'da "Ishlarim" bo'sh kartochkasi butun kenglikda; Kabinet matnli, tuzilmasiz | KPI, Kabinet | P3 |
| T11 | Navy sidebar ekranning eng to'q va eng katta bo'lagi; undagi 3 ta holat qatori (mavzu, avto-sinxron, sinxron vaqti) | hamma joyda | P2 |

Yaxshi ishlayotgani va saqlanadigani: davomat ro'yxati (ikki ustun, 40px qator, harf bosib topish),
Reja qatorlari (harakat qatorning o'zida), sur'at chizig'i (`u` belgisi), halol holat qoidalari, Ctrl K.

---

## 2. Qulflangan (10%)

1. `PRODUCT.md` to'liq: bitta foydalanuvchi, to'rt lahza, besh tamoyil, faqat desktop (1024–1920), o'zbekcha.
2. Brend: nom `attendance`, shrift **Public Sans** (jadval raqamlari bilan), sokin va aniq, metaforasiz.
3. Texnik: Go + SQLite, vanilla JS, **build yo'q**, qat'iy CSP (inline skript/uslub yo'q, begona host yo'q).
4. Ma'lumot va API o'zgarmaydi; saytga yozilmaydi; `web/lib/*` dagi hisob-kitob (golden testlar) o'zgarmaydi.
5. Holat nomlari: `Olingan · Olinmoqda · Tugatilmagan · Olinmagan · Noma'lum`, `Reja yo'q · Reja bor · Tayyor`.
6. Halol holat: yashil = sayt yoki ilova tasdiqladi; qizil = hozir harakat; sariq = eski yoki taxminiy; kulrang = noma'lum. Taxminiy sonlarda `~` qoladi. O'nlik kasr nuqta bilan (`55.2%`).
7. Sanalar `8-noyabr`, kiritishda `kk.oo.yyyy`. Hafta 6 ish kuni.
8. `make check` yashil qoladi; e2e oqimlari yangi tuzilmaga ko'chiriladi, o'chirilmaydi.

---

## 3. Dizayn tamoyillari

1. **Bitta ekran — bitta savol.** Har sahifa bitta savolga javob beradi ("hozir nima?", "bu hafta qanday?", "oy yopilishiga nima qoldi?"). Javob birinchi 3 soniyada, aylantirmasdan ko'rinadi.
2. **Bitta asosiy tugma.** Ekranda to'ldirilgan ko'k tugma ko'pi bilan bitta. Qolgani ikkinchi darajali yoki matnli.
3. **Har narsa bir marta aytiladi.** Son yoki ogohlantirish to'liq holda faqat o'z sahifasida turadi; boshqa joyda — unga olib boradigan bir qatorli havola.
4. **Kartochka emas, satr.** Kontent zaminda turadi, ingichka chiziq bilan ajraladi. Hoshiya faqat mustaqil "narsa"ga beriladi: dars bloki, oyna, tanlangan element.
5. **Rang — signal, bezak emas.** Sahifaning 90% neytral. Ko'k = harakat va tanlov. Qizil = hozir bosish kerak. Fan ranglari faqat jadval va yuklamada.
6. **Zichlik joyiga qarab.** Yo'qlama va jadvallar zich (40px qator); o'qiladigan sahifalar erkin.
7. **Avval inline.** Tahrir qatorning o'zida; yon varaq (sheet) — ko'p maydonli ish uchun; modal faqat qaytarib bo'lmaydigan tasdiq uchun.
8. **Sonlar ishlashi kerak.** Son yonida doim u nimani anglatishi va nima qilish kerakligi turadi (`108 soat orqadasiz`), yalang'och `0%` ko'rsatilmaydi.
9. **Klaviatura birinchi.** Har asosiy oqim sichqonsiz bajariladi; fokus doim ko'rinadi.
10. **Jimgina xato yo'q.** Eskirgan, qisman, noma'lum ma'lumot o'z o'rnida belgilanadi.

---

## 4. Axborot arxitekturasi

### 4.1 Navigatsiya: 11 → 7

```
Hozir                         Keyin
─────────────────────         ─────────────────────────────────────────
Bosh sahifa                   Bugun            #/
Dars jadvali          ┐
Dars rejasi           ┘──→    Jadval           #/jadval      (Setka | Ro'yxat)
HISOBOT                       ── Hisobot
  Yuklama                       Yuklama        #/yuklama
  Ilmiy KPI                     Ustama         #/ustama
  Ustama                        Ilmiy KPI      #/ilmiy-kpi
KURS · 2-ATT-25               ── Kurs
  Darslar             ┐
  Talabalar           ├──→      2-ATT-25  (6)  #/guruh       (Darslar | Talabalar | Qarzlar | Mavzular)
  Qarzlar             ┘
TIZIM
  Bildirishnomalar    ┐
  Kabinet             ┘──→    Sozlamalar       #/sozlamalar
```

- Ustama KPI'dan oldin: u har oy yopiladi, KPI — semestrda.
- "Kurs rejasi" (mavzular ro'yxati) Reja sahifasidan guruhning **Mavzular** bo'limiga ko'chadi: u kursga tegishli, haftaga emas.
- Mavzu (yorug'/qorong'i/avto) sidebar'dan **Sozlamalar → Ko'rinish** ga va Ctrl K buyruqlariga ko'chadi.
- Sidebar pastida bitta holat qatori qoladi: `Sinxron: bugun 22:07` (eskirsa sariq/qizil, bosilsa Sozlamalar). Chiqish — Sozlamalar ichida va Ctrl K da.

### 4.2 Marshrutlar

| Yangi | Ichida | Eski manzil (yo'naltiriladi) |
|---|---|---|
| `#/` | Bugun | — |
| `#/jadval`, `#/jadval/royxat` | hafta setkasi; kunlar bo'yicha ro'yxat + reja | `#/reja` → `#/jadval/royxat` |
| `#/dars/:id` | yo'qlama | o'zgarmaydi |
| `#/guruh`, `#/guruh/talabalar`, `#/guruh/qarzlar`, `#/guruh/mavzular` | kurs guruhi | `#/darslar`, `#/talabalar`, `#/qarzlar` |
| `#/talaba/:id` | talaba | o'zgarmaydi |
| `#/yuklama`, `#/ustama`, `#/ilmiy-kpi` | hisobotlar | o'zgarmaydi |
| `#/sozlamalar` | Sayt bilan aloqa · Semestr · Bildirishnomalar · Zaxira · Ko'rinish · Hisob | `#/kabinet`, `#/bildirishnomalar` |

Eski manzillar doim ishlaydi (bildirishnoma bosilishi, xatcho'plar, e2e).

### 4.3 Sahifa qolipi

Har sahifa shu besh qavatdan, shu tartibda. Bo'sh qavat chizilmaydi.

```
1  Sarlavha     H1 · bir qatorli kontekst (ko'pi bilan 2 fakt)            [bitta asosiy tugma]
2  Holat        eskirgan / qisman sinxron qatori — faqat kerak bo'lsa
3  Yetakchi     shu sahifaning "keyingi qadami" — bitta
4  Asosiy       bitta asosiy ob'ekt: jadval, setka yoki ro'yxat
5  Tafsilot     yopiq holda: izoh, "qanday hisoblanadi?", tarix
```

---

## 5. Vizual til

Yo'nalish: **neytral, ingichka chiziqli, bitta ko'k**. Namuna: Apple Reminders'ning sokinligi, Vercel'ning
chiziqlari, Stripe jadvallarining aniqligi. Og'irlikni rang emas, o'lcham va qalinlik beradi.

### 5.1 Rang tokenlari

Semantik nomlar; komponentlar faqat shu nomlarni ishlatadi, hex yozilmaydi.

| Token | Yorug' | Qorong'i | Vazifa |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0e1116` | sahifa zamini, kontent shu yerda |
| `--bg-side` | `#f6f7f9` | `#0a0d11` | sidebar |
| `--bg-sunk` | `#f1f3f5` | `#1a1f27` | hover, segment, yo'lakcha, jadval sarlavhasi |
| `--bg-raise` | `#ffffff` | `#161a21` | suzuvchi yuza: oyna, varaq, popover |
| `--line` | `#e6e8eb` | `#232a33` | ajratuvchi chiziq |
| `--line-strong` | `#d0d5da` | `#343d49` | tugma hoshiyasi, dars bloki hoshiyasi |
| `--control` | `#7d8793` | `#6b7685` | input va select hoshiyasi (zaminda ≥ 3:1) |
| `--text` | `#12181f` | `#e9edf2` | matn (17.9:1 / 16.1:1) |
| `--muted` | `#586472` | `#a3adb8` | ikkinchi darajali matn (6.0:1 / 8.3:1; `--bg-sunk` da ham ≥ 5.4:1) |
| `--accent` | `#1f5fbf` | `#6ba6f5` | yagona asosiy tugma, havola, tanlov, o'lchagich (6.1:1 / 7.6:1) |
| `--accent-soft` | `#eaf1fb` | `#17304d` | tanlangan qator, ko'k chip |
| `--ok` / `--ok-soft` | `#0e7c66` / `#e5f4ef` | `#45c4a6` / `#12332e` | tasdiqlangan |
| `--warn` / `--warn-soft` | `#925a08` / `#fbf1df` | `#e3a84a` / `#3a2c14` | eski, taxminiy |
| `--bad` / `--bad-soft` | `#b4432f` / `#fbeae6` | `#ee8a76` / `#3d1f19` | hozir harakat kerak |
| `--c1`…`--c8` | hozirgidek | hozirgidek | fan ranglari: faqat jadval va yuklama |

Kontrastlar hisoblangan (WCAG formulasi): matn juftlari ≥ 4.5:1 uchala zaminda, yumshoq fon ustidagi holat
ranglari ≥ 4.5:1. Qurishda `shoot` o'lchovi har ekranda qayta tekshiradi (`low: 0` bo'lishi shart).

Q1(b) tanlansa faqat shu o'zgaradi: `--bg-side: #0c2136` (qorong'ida `#081019`) va `.sidebar` ichida
matn tokenlari hozirgi `--nav-*` qiymatlariga qayta yo'naltiriladi.

Rang qoidalari:

- Qizil matn/fon faqat **bosiladigan** muammoda. Ro'yxatdagi 10 ta bir xil muammo — bitta qizil sanoq + qatorlarda neytral belgi.
- Yumshoq fon (`*-soft`) faqat chip va bir qatorli bildirgida. Butun bo'lim bo'yalmaydi.
- Rang hech qachon yagona signal emas: yoniga ikonka yoki so'z.

### 5.2 Tipografika

Public Sans, `font-variant-numeric: tabular-nums`, fayl 400–700 og'irlikni beradi (800 yo'q, so'ralmaydi).

| Token | O'lcham / qator | Og'irlik | Qayerda |
|---|---|---|---|
| `--t-hero` | 40 / 44 | 700, `-0.02em` | sahifada bitta yetakchi son yoki vaqt |
| `--t-title` | 24 / 32 | 700, `-0.015em` | H1 |
| `--t-head` | 17 / 24 | 600 | bo'lim sarlavhasi |
| `--t-body` | 15 / 22 | 400; muhim so'z 600 | matn, jadval |
| `--t-small` | 13 / 18 | 400–500 | ikkinchi qator, chip, izoh |
| `--t-micro` | 12 / 16 | 500, `0.04em`, bosh harflar | faqat jadval ustun sarlavhasi va sidebar guruh nomi |

Olti o'lcham, boshqasi yo'q. 12px dan kichik matn yo'q. Hozirgi 56px hero va 28px plitka sonlari 40 va 24 ga tushadi.

### 5.3 Oraliq, shakl, chuqurlik

- Oraliq: 4px to'r — `4 8 12 16 24 32 48 64`. Bo'limlar orasi 32, bo'lim ichida 16, qator ichida 8–12.
- Radius: boshqaruv `6`, dars bloki va guruhlangan ro'yxat `10`, oyna va varaq `14`, chip to'liq yumaloq.
- Chiziq: 1px `--line`. Soya faqat suzuvchi narsada (popover, varaq, oyna, toast): `0 12px 32px rgb(0 0 0 / .12)`.
- Boshqaruv balandligi: 32 (oddiy), 40 (yo'qlama va asosiy tugma). Bosiladigan maydon ≥ 24×24.
- Ikonka: 16px, 1.75 chiziq, matn rangida; faqat ma'no qo'shganda (holat, harakat), bezak uchun emas.
- Fokus: `2px solid var(--accent)`, `outline-offset: 2px`, har interaktiv elementda, `:focus-visible` bilan.

### 5.4 Maket

```
┌──────────┬────────────────────────────────────────────────────────┐
│ sidebar  │  main: max 1200 (≥1680 ekranda 1520), chetdan 32–48     │
│ 216px    │  ┌───────────────────────────────┬──────────────────┐  │
│          │  │ asosiy ustun                  │ yon ustun 320–360│  │
│          │  └───────────────────────────────┴──────────────────┘  │
└──────────┴────────────────────────────────────────────────────────┘
```

- Sidebar 216px (≤1240 da 200), o'z zaminida, o'ngida bitta chiziq. Joriy band: `--bg-sunk` fon + 600 og'irlik; chap chiziqcha yo'q.
- Yon ustun faqat mustaqil ikkinchi ob'ekt bo'lsa (Navbat, yo'qlama xulosasi). Aks holda bitta ustun.
- 1024–1240: yon ustun asosiyning ostiga tushadi; gorizontal aylantirish hech qayerda yo'q.

### 5.5 Harakat

Faqat holat o'zgarishi: 120ms (rang, hover), 180ms (varaq, popover), `cubic-bezier(.2,.8,.2,1)`.
Kirish animatsiyasi yo'q. Yo'qlamadagi belgilash 0ms — darsda kutish yo'q. `prefers-reduced-motion` da hammasi 0.

---

## 6. Komponentlar

Bir komponent — bir ko'rinish, hamma sahifada. Ro'yxatda yo'q narsa qo'shilmaydi.

| Komponent | Qoida |
|---|---|
| **Tugma** | `primary` (ko'k, ekranda ≤ 1) · `secondary` (hoshiyali) · `quiet` (matn) · `danger` (faqat tasdiq oynasida). Yozuvi fe'l: `Davomatni tugatish`, `Qabul qilish`. |
| **Maydon** | yorliq tepada, 13px; xato maydon ostida, `aria-invalid`; placeholder yorliq o'rnini bosmaydi. |
| **Segment** | 2–4 ko'rinish orasida (Setka \| Ro'yxat). **Tab** — guruh sahifasidagi bo'limlar, sanoq bilan. |
| **Holat belgisi** | ikonka + so'z, fonsiz (jadval ichida); chip (fonli) faqat sarlavha yonida. Bir holat — bir nom, bir rang. |
| **Jadval** | ustun sarlavhasi `--t-micro`, fon `--bg-sunk`; qator 44px (zich 40px); sonlar o'ngga; butun qator bosiladi; bo'sh katak chizilmaydi (`–` ustuni yo'q, ustun yashiriladi). |
| **Ro'yxat qatori** | chap: vaqt/sana · o'rta: nom + ikkinchi qator · o'ng: holat yoki bitta harakat. Reja, Bugun, Navbat, Qarzlar shu qolipda. |
| **O'lchagich** | 4px yo'lakcha + `u` belgisi (bugun bo'lishi kerak bo'lgan joy). Halqa (ring) olib tashlanadi: yo'lakcha bilan bir narsani aytadi. |
| **Faktlar qatori** | `yorliq · qiymat` juftlari bir qatorda, chiziq bilan ajratilgan. Plitkalar (`.tiles`, `.home-stats`) o'rniga. |
| **Bildirgi** | bir qator: ikonka · gap · havola. Uch turi: `bad`, `warn`, `info`. Katta rangli banner yo'q; uzun izoh havola ortida. |
| **Dars bloki** | jadval katagi: chap 3px fan rangi, 10px radius. Holat **to'ldirish** bilan: olingan — fan rangida to'q fon; kelgusi — och fon; olinmagan — fonsiz, punktir hoshiya. Qator: fan · guruh · xona · holat so'zi. |
| **Kun tanlagich** | 7 kun bir qatorda: hafta kuni, sana, `2 / 4 tayyor`. Tanlangani `--accent-soft`. |
| **Varaq (sheet)** | o'ngdan 480px, sarlavha + forma + pastda yopishgan tugmalar; Esc yopadi, fokus qaytadi; xato varaq ichida. |
| **Oyna** | faqat tasdiq: nima bo'ladi, qaytarib bo'ladimi; standart fokus — xavfsiz tugmada. |
| **Toast** | pastda o'rtada, 4 s, `aria-live="polite"`; xato toast emas — joyida ko'rsatiladi. `Bekor qilish` harakati bo'lishi mumkin. |
| **Buyruqlar (Ctrl K)** | sahifalar, talabalar, darslar, harakatlar (`Sinxronlash`, `Mavzu: qorong'i`, `Chiqish`). |
| **Bo'sh holat** | bir gap (nima yo'q) + bitta tugma (nima qilish). Rasm yo'q. |
| **Skelet** | jadval va ro'yxat qatorlari shaklida, 300ms dan keyin chiqadi. |

Har komponentning holatlari: oddiy, hover, fokus, bosilgan, o'chirilgan, yuklanmoqda, xato.

---

## 7. Ekranlar

### 7.1 Bugun `#/`

Savol: **hozir nima qilaman?** Hozirgi 9 blok o'rniga uch zona va bitta jim qator.

```
Bugun                                                    9-hafta / 15 · 36 kun qoldi
14-noyabr, shanba

HOZIR ─────────────────────────────────────────────    NAVBAT  3 ──────────────────
11:30   Algoritmlash                                    ! Ustma-ust: dushanba 4-para    Ko'rish
3-para  2-ATT-25 · Amaliy · K4 / 309                    ! 2-ATT-25: 21 darsda davomat   Ochish
        Dars tugadi, davomat tugatilmagan               ! Saytda 2 darsda davomat       Jadval
        [ Davomatni tugatish ]                          ── keyinroq ──
                                                        Ustama: 5 band ochiq, 16 kun    Ustama
BUGUN ─────────────────────────────────────────────     6 ta qarz topshirilmagan        Qarzlar
3-para 11:30  ▍Algoritmlash · 2-ATT-25      Tugatilmagan
4-para 13:20  ▍Bulutli texn. · S1-KT-22     ✓ Olingan
Ertaga dars yo'q

──────────────────────────────────────────────────────────────────────────────────────
Semestr 26.4% · 108 soat orqada  │  Bu hafta 34 / 34 soat  │  Davomat 94.4%  │  Ustama 0%, 5 ochiq
```

- **Hozir**: bitta dars (ketayotgan, keyingi yoki tugatilmagan), vaqt `--t-hero`, bitta asosiy tugma. Dars yo'q bo'lsa: keyingi dars sanasi va `Jadvalni ochish`.
- **Navbat**: ilovadagi barcha ogohlantirishlarning yagona ro'yxati; har qator o'z sahifasiga olib boradi yoki joyida bajariladi. Qizillar tepada, qolgani "keyinroq" ostida. Bo'sh bo'lsa: `Hammasi joyida` va yashil belgi — ekrandagi yagona yashil.
- **Bugun**: kunning darslari ro'yxat qatori bilan.
- **Jim qator**: to'rtta fakt, har biri o'z sahifasiga havola. Halqa, ustunli diagramma, 4 plitka olib tashlanadi — ular Yuklama va guruh sahifalarida to'liq turadi.

### 7.2 Jadval `#/jadval`

Savol: **bu hafta qanday va nimaga tayyorman?**

```
Jadval   9–14-noyabr · 9-hafta                    [ Setka | Ro'yxat ]   ‹  Bu hafta  ›
! 10 ta darsda davomat olinmagan · 1 ta ustma-ust                              Ko'rish
┌──────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│ Para │ Du 9     │ Se 10    │ Cho 11   │ Pay 12   │ Ju 13    │ Sha 14 • │
```

- Sarlavhada sanalar va hafta raqami. Sonlar (`17 dars · 34 soat`) setkaning `Jami` qatorida qoladi.
- Bitta bildirgi qatori (T2, T3, T4): muammolar sanog'i; `Ko'rish` faqat muammoli darslarni ajratib ko'rsatadi. Setka 200px dan boshlanadi.
- Ustma-ust katak: ikki blok yonma-yon, qizil hoshiya va `Ustma-ust` belgisi — izohi shu belgi bosilganda popover'da.
- **Ro'yxat** ko'rinishi = hozirgi Dars rejasi: kun tanlagich + kun darslari qatorlari (`Rejalash` / `Reja bor` / `Tayyor`), ↑/↓ va Enter. Mavzu taklifi (`.suggest`) saqlanadi.
- `←/→` hafta, `T` bugun, `V` ko'rinishni almashtiradi.

### 7.3 Dars `#/dars/:id` (yo'qlama)

Savol: **kim yo'q?** Eng tez ekran; tuzilishi saqlanadi, shovqini kamayadi.

```
‹ 2-ATT-25
Algoritmlash · 14-noyabr, 3-para · 11:30–12:50                     ● Tugatilmagan

[ Talabani topish…                 ]                   17 / 18 keldi
 #  Talaba            Holat │  #  Talaba        Holat  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▭
 1  Abdullayev Jasur  ✓     │ 10  Rahimov S.    ✓      Kelmadi: Sobirova Malika
 …                          │ 13  Sobirova M.   ✕ Kelmadi
                                                       Mavzu [ Rekursiya          ]
                                                       [ Davomatni tugatish ]
                                                       Hammasi keldi · Sozlamalar
```

- `Keldi` so'zi 17 marta takrorlanmaydi: kelgan — faqat `✓` (yashil emas, neytral), **kelmagan** — qizil `✕ Kelmadi`. Ko'z faqat istisnoni ko'radi.
- `Baho` ustuni faqat baho qo'yilayotganda chiqadi (hozirgi "ko'rsatganda chiziladi" qoidasi kengaytiriladi).
- Yon ustun yopishqoq: sanoq, kelmaganlar ro'yxati, mavzu, bitta asosiy tugma. `Hammasi keldi` va dars sozlamalari — matnli havolalar.
- Klaviatura: harf → qidiruv, ↑/↓ yurish, `Space` belgilash, `Enter` keyingisi, `Ctrl+Enter` tugatish.
- Reja shu darsga yozilgan bo'lsa mavzu oldindan to'ldiriladi.

### 7.4 Guruh `#/guruh` (2-ATT-25)

Savol: **kursim qanday ketyapti?** Uch sahifa bitta ish joyiga yig'iladi.

```
2-ATT-25   Algoritmlash · 18 talaba · davomat 94%              [ Davomat boshlash ]
[ Darslar 8 | Talabalar 18 | Qarzlar 6 | Mavzular 7/12 ]
```

- **Darslar**: oy bo'yicha jadval (sana, para, mavzu, keldi). `Davomat boshlash` bitta tugma: bugungi para oldindan tanlangan popover, sana o'zgartirish shu yerda (T9: ikki forma bitta bo'ladi).
- **Talabalar**: saralanadigan jadval; qator → `#/talaba/:id`.
- **Qarzlar**: bitta jadval, tepasida segment `Qolgan 6 | Topshirilgan 2 | Hammasi`; talaba bo'yicha filtr — jadval ustidagi qidiruv (chap ustundagi ikkinchi ro'yxat olib tashlanadi). `Qabul qilish` qatorning o'zida.
- **Mavzular**: kurs rejasi (o'tilgan / jami, orqada qolish), Reja sahifasidan ko'chadi.

### 7.5 Yuklama `#/yuklama`

Savol: **rejadan oldindamanmi, orqadami?**

```
Yuklama   2026-2027 kuz · 54-ish kuni / 90

26.4%   108 soat orqadasiz
▬▬▬▬▬▬▬▨▨▨▨─────────┃──────────────────────   o'tildi 86 · jadvalda 60 · bugun kerak ~194 · jami ~326
Shu sur'atda semestr oxirida ~143 soat bo'ladi: ~183 soat yetmaydi.

Ma'ruza 52.2% · −2 soat  │  Amaliy 22.1% · −106 soat  │  Haftasiga kerak ~40 · hozir 9.6

FAN VA GURUH … (jadval hozirgidek)
```

- Yetakchi: bitta son, bitta hukm, bitta chiziq, bitta bashorat gapi. Uchta kartochka (Ma'ruza, Amaliy, Oxirigacha) faktlar qatoriga aylanadi; "Bashorat" ro'yxatidagi qolgan gaplar jadval tagidagi tafsilotga tushadi.
- Jadval saqlanadi (eng aniq qism). Fan qatori foni — faqat chapda rangli nuqta, to'liq bo'yalgan qator emas.

### 7.6 Ustama `#/ustama`

Savol: **oy yopilishiga nima qoldi?**

- Yetakchi: `5 band ochiq · 30 ball · 16 kun qoldi` va chiziq. `0% / +0% / 0% / 0 / 5` to'rtligi olib tashlanadi (T7): tasdiqlangan foiz bir marta, chiziq yonida.
- Ro'yxat: avval **men bajaradiganlar** (bosqichlar qatorning o'zida, keyingi bosqich ajratilgan), keyin "oy oxirida tasdiqlanadi". Bajarilganlar pastga tushadi va xiralashadi.
- Jarimalar va oylar tarixi — yon ustunda emas, pastdagi tafsilotda; oy tanlash sarlavhada.

### 7.7 Ilmiy KPI `#/ilmiy-kpi`

- Yetakchi: `6.00 ball · minimal talab bajarilgan` (bitta gap), `Yangi ish` asosiy tugma.
- Bitta ro'yxat: **ishlar** (mening jarayondagi ishlarim + saytdagilar bir joyda, holat bilan: `Yozilmoqda → Topshirildi → Saytda → Tasdiqlangan`). Bandlar jadvali (vazn, soni, ball, cheklov) — ostida, yopiq tafsilot.

### 7.8 Sozlamalar `#/sozlamalar`

Bir ustun, 640px, bo'limlar chiziq bilan: **Sayt bilan aloqa** (holat, oxirgi sinxron, `Hozir sinxronlash`,
cookie; qo'llanma yopiq holda) · **Semestr** · **Bildirishnomalar** · **Zaxira nusxa** · **Ko'rinish** · **Hisob** (`Chiqish`).
Har bo'limda o'z `Saqlash` tugmasi yo'q joyda — o'zgarish darhol saqlanadi va toast chiqadi.

### 7.9 Kirish va ommaviy sahifa

Kirish: markazda nom, bitta maydon, bitta tugma; xato maydon ostida. Talabalar uchun ommaviy qarzlar sahifasi
(`public.js`) shu tokenlarni oladi; u telefon kengligida ham o'qiladi (yagona istisno, hozir ham shunday).

---

## 8. Holatlar

Har ekran sakkizta holatda chiziladi va skrinshot qilinadi:

| Holat | Ko'rinishi |
|---|---|
| Yuklanmoqda | skelet qatorlar; sarlavha darhol |
| Bo'sh | bir gap + bitta tugma |
| Xato | joyida `bad` bildirgi + `Qayta urinish`; forma xatosi maydon ostida |
| Eskirgan | sarlavha ostida qator: 2 soatdan keyin jim, 1 kundan keyin qizil + `Sinxronlash` |
| Qisman sinxron | `Qisman yangilangan` + qaysi bo'lim |
| Noma'lum | kulrang, kursiv, `Noma'lum`; yashil emas |
| Ustma-ust | katak/qator belgisi + Navbatda bitta qator |
| Hammasi bajarilgan | jim tasdiq, bayramsiz: `Hammasi joyida` |

---

## 9. Qulaylik (WCAG 2.2 AA)

- Kontrast: matn ≥ 4.5:1, yirik matn va boshqaruv hoshiyasi ≥ 3:1, ikkala mavzuda.
- Klaviatura: hamma narsa Tab bilan yetiladi, tartib ko'rinish tartibida; `Asosiy qismga o'tish` havolasi qoladi; varaq va oyna fokusni ushlaydi va qaytaradi.
- Semantika: bitta `h1`, tartibli `h2`; jadvalda `th scope`; `aria-current="page"`; holat o'zgarishi `aria-live`; ikonkali tugmada `aria-label`.
- Rang yagona signal emas; bosiladigan maydon ≥ 24×24; 200% kattalashtirishda buzilmaydi; `prefers-reduced-motion` hurmat qilinadi.
- Qisqa tugmalar: `Ctrl K` yoki `/` buyruqlar, `?` tugmalar ro'yxati, `G` keyin `B/J/G/Y/U/K/S` sahifalar. Maydonda yozayotganda bir harfli tugmalar o'chadi.

---

## 10. Matn qoidalari

- Tugma — fe'l va ob'ekt: `Davomatni tugatish`. `OK`, `Ha` yo'q.
- Yo'qlikni emas, harakatni ayt: `Rejalash`, `Reja yo'q` emas.
- Son + birlik + ma'no: `108 soat orqadasiz`. Taxmin `~` bilan.
- Bir tushuncha — bir so'z, hamma joyda (2-bo'limdagi holat nomlari; `dars`, `para`, `guruh`, `qarz`, `band`).
- Xato: nima bo'ldi + nima qilish kerak, ayblovsiz. `Sayt sessiyasi tugagan. Sozlamalarda cookie'ni yangilang.`
- Bo'sh holat bir gap. Undov belgisi va emoji yo'q.

---

## 11. Kod tuzilmasi (build'siz)

```
web/
  index.html            qobiq: sidebar, <main id="view">, oynalar
  css/
    tokens.css          5.1–5.3 tokenlar, ikkala mavzu (qorong'i qiymatlar BIR marta)
    base.css            reset, tipografika, fokus
    layout.css          qobiq, sidebar, sahifa qolipi
    components.css      6-bo'limdagi komponentlar
    pages.css           faqat sahifaga xos joylashuv
  ui/                   h(), icon(), button(), table(), sheet(), toast(), palette() …
  views/                today.js  schedule.js  lesson.js  group.js  student.js
                        load.js  bonus.js  kpi.js  settings.js
  lib/                  o'zgarmaydi (golden testlar bilan qo'riqlanadi)
  app.js                router, api(), holat — ~300 qator
```

- CSS `@layer tokens, base, layout, components, pages;` bilan: o'ziga xoslik urushi yo'q, `!important` yo'q.
- Qorong'i qiymatlar bir marta: `theme.js` `<html>` ga `data-theme` ni doim qo'yadi (avto rejimda ham), hozirgi ikki nusxa blok yo'qoladi.
- Fayllar oddiy `<script>` bilan ulanadi (`lib/` dagi kabi), CSP o'zgarmaydi. Komponentda hex, px o'lchamli shrift va tokensiz oraliq yozilmaydi.
- Eski klass nomlari ko'chirilmaydi: yangi nomlar komponent ro'yxatidan; `app.css` oxirida o'chiriladi.

---

## 12. Qurish tartibi

Har bosqich alohida commit(lar), har biridan keyin ilova ishlaydi va `make check` yashil.

| # | Bosqich | Tayyor degani |
|---|---|---|
| 0 | **Poydevor**: tokenlar, `css/` qatlamlari, `ui/` primitivlari, `/#/_ui` namoyish sahifasi (faqat demo rejimda) | har komponent har holatda, ikki mavzuda bir sahifada ko'rinadi; kontrast o'lchovi `low: 0` |
| 1 | **Qobiq**: sidebar 7 band, marshrutlar va yo'naltirishlar, sahifa qolipi, Ctrl K buyruqlari | eski manzillarning hammasi ochiladi; e2e marshrut ro'yxati yangilangan |
| 2 | **Dars (yo'qlama)** | 18 talabali guruh 1280×720 da aylantirmasdan; butun oqim klaviaturadan |
| 3 | **Bugun** | 3 zona; hech bir son ikki marta emas; Navbat bo'sh holati |
| 4 | **Jadval** (Setka + Ro'yxat) | setka ≤ 200px dan boshlanadi; hafta 1440×900 ga sig'adi; reja oqimi saqlangan |
| 5 | **Guruh** (4 bo'lim) + Talaba | uch eski sahifaning har oqimi yangi joyda ishlaydi |
| 6 | **Yuklama, Ustama, Ilmiy KPI** | har birida bitta yetakchi; golden testlar tegilmagan |
| 7 | **Sozlamalar**, kirish, ommaviy sahifa | sinxron, semestr, zaxira, bildirishnoma oqimlari ishlaydi |
| 8 | **Tozalash**: `app.css` va eski klasslar o'chadi, `DESIGN.md` qayta yoziladi | `web/` da ishlatilmagan uslub yo'q; hujjat kodga mos |

Har bosqichdagi tekshiruv aylanishi:

1. `attendance demo --no-login --with-site`; sahifa 1280×720, 1440×900, 1920×1080 da, yorug' va qorong'ida skrinshot (`docs/audit/screenshots/shoot.mjs.txt`).
2. O'lchov: `overflowX ≤ 0`, `low: 0`, `small: 0`, `tiny: 0`, konsolda xato yo'q.
3. 8-bo'limdagi holatlar (`--stale-days`, bo'sh baza, ustma-ust) alohida suratga olinadi.
4. Oldin/keyin yonma-yon ko'riladi; 13-bo'lim mezonlari tekshiriladi; `make check`.

---

## 13. Qabul mezonlari

- [ ] Sidebar'da 7 band; har eski manzil yangi joyga olib boradi.
- [ ] Har sahifada birinchi ekranda bitta "keyingi qadam" va ko'pi bilan bitta ko'k tugma.
- [ ] Hech bir son yoki ogohlantirish bir ekranda ikki marta emas; ustma-ust banneri bir joyda.
- [ ] Qizil faqat bosiladigan muammoda; Jadvalda qizil yozuvlar soni muammolar bildirgisi + ustma-ust kataklar bilan cheklanadi.
- [ ] 6 ta shrift o'lchami, 4px to'r, 3 ta radius; komponentlarda hex yo'q.
- [ ] Yo'qlama: 18 talaba 1280×720 da aylantirmasdan, boshidan oxirigacha klaviaturadan.
- [ ] Yorug' va qorong'i, 1280 / 1440 / 1920: toshish yo'q, kontrast AA, fokus ko'rinadi.
- [ ] 8 holatning har biri har sahifada ko'rib chiqilgan.
- [ ] `make check` yashil; `web/lib/*` va golden fayllar o'zgarmagan.
- [ ] `DESIGN.md` yangi tilni tasvirlaydi; `PRODUCT.md` da navigatsiya atamalari yangilangan.

---

## 14. Qilinmaydi

Telefon maketi (ommaviy sahifadan tashqari) · yangi funksiya yoki API · freymvork, build, tashqi shrift yoki
kutubxona · illyustratsiya, gradient, shisha effekti, kirish animatsiyasi · diagramma kutubxonasi (chiziq va
ustunlar CSS bilan) · saytga yozish.
