# attendance — yaxshilash uchun tayyor promptlar

Har bir prompt alohida, Claude Code'ga to'g'ridan-to'g'ri berish uchun yozilgan.
Ular `PRODUCT.md` va `DESIGN.md` ga suyanadi: bitta foydalanuvchi (o'qituvchi), faqat desktop,
Go + SQLite + vanilla JS, build bosqichi yo'q, qat'iy CSP, interfeys o'zbekcha, saytga hech qachon yozmaydi.

Har bir promptning umumiy qolipi (internetdagi eng yaxshi UI/UX prompt qo'llanmalaridagi
"kontekst → maqsad → aniq shartlar → qabul mezonlari" tuzilmasi):

```
Kontekst: <qaysi sahifa, qaysi fayl, hozir nima bor>
Muammo:   <foydalanuvchi nimani his qilyapti>
Vazifa:   <aniq nima qilinsin>
Shartlar: <PRODUCT.md tamoyillari, CSP, o'zbekcha matn, faqat desktop>
Tayyor bo'lganda: <tekshiriladigan natija, test, skrinshot>
```

Tartib: avval xatolar (P0), keyin kundalik qulaylik (P1), keyin tahlil va prognoz (P2), oxirida sayqal (P3).

---

## P0. Xatolar

### 1. ✅ Ustma-ust darslar uchun reja berilmayapti

Sabab (kodda tekshirildi): reja `(date, para)` bo'yicha saqlanadi.
`internal/store/plans.go` da `lesson_plans` jadvali `on conflict (date, para)` bilan yoziladi,
`web/app.js` dagi `planKey = date + "|" + para`. Izohda "A teacher gives one lesson per para" deb faraz qilingan.
Dushanba 4-parada ikki dars bor (Algoritmlash 2-ATT-25 va Bulutli texnologiyalar S5-KT-22),
shuning uchun ikkalasi bitta rejani ko'radi va biri ikkinchisining rejasini ustidan yozadi.

```
Kontekst: Dars rejasi sahifasi (web/app.js, plansView/openPlan/planKey) va internal/store/plans.go.
Reja hozir (date, para) kaliti bilan saqlanadi, lekin bitta parada ikki dars bo'lishi mumkin
(masalan, 16-noyabr 4-para: Algoritmlash 2-ATT-25 va Bulutli texnologiyalar S5-KT-22).

Muammo: bir darsga yozilgan reja ikkinchisida ham chiqadi, saqlaganda biri ikkinchisini o'chiradi.

Vazifa:
1. Reja kalitini (date, para, subject, group) qiling. Migratsiya: eski qatorlar saqlansin,
   yangi ustunlar bo'yicha unique indeks; mavjud yozuvlarning subject/grp qiymatlari bor.
2. planKey, planOf, savePlan, carryOver va "o'chirish" so'rovi yangi kalit bilan ishlasin.
3. Dars jadvali, Dars rejasi va Bosh sahifada bir vaqtdagi darslarni aniqlang va
   ko'rinadigan "Ustma-ust" belgisini qo'ying (sariq ogohlantirish, hover'da qaysi dars bilan
   to'qnashgani: "4-para: Bulutli texnologiyalar, S5-KT-22 bilan bir vaqtda").
   Bu yumshoq ogohlantirish: hech narsani bloklamaydi, faqat ko'rsatadi.
4. "Ordinal" (71-amaliy) va kurs rejasidagi "orqada" hisobi ustma-ust darslarda ham to'g'ri qolsin.

Shartlar: PRODUCT.md 4-tamoyil ("Nothing silently wrong"). Matn o'zbekcha. Saytga yozilmaydi.
Tayyor bo'lganda: Go testi (bir date+para da ikki xil fan uchun ikkita reja saqlanadi va
ikkalasi alohida o'qiladi), make check o'tadi, demo rejimda skrinshot.
```

---

## P1. Kundalik qulaylik

### 2. "Hozir va keyingi" — bir qarashda

```
Kontekst: Bosh sahifa. O'qituvchi darsdan oldin 3 soniya qaraydi: nima, qayerda, qaysi guruh.
Vazifa: Bosh sahifa tepasida bitta "Hozir / Keyingi dars" kartasi: fan, guruh, xona, nechanchi para,
qancha vaqt qoldi ("23 daqiqadan keyin"), reja holati (Reja yo'q / Reja bor / Tayyor) va bitta asosiy tugma
(2-ATT-25 bo'lsa "Davomat", aks holda "Reja"). Dars paytida karta "Davom etmoqda, 40 daq qoldi" ga o'tadi.
Ustma-ust bo'lsa ikkala dars ko'rinadi va ogohlantirish bilan.
Shartlar: bitta asosiy harakat, boshqa hamma narsa ikkilamchi. Hech qanday modal yo'q.
Tayyor bo'lganda: soatni o'zgartirib (test uchun) 4 holat skrinshoti: darsdan oldin, dars paytida,
tanaffusda, kun tugaganda.
```

### 3. Dars rejasi sahifasini ixchamlashtirish

```
Kontekst: Dars rejasi sahifasi (skrinshotdagi). "Mavzu yozilmagan" va "Reja yo'q" har qatorda takrorlanadi,
ko'z charchaydi; qaysi qatorga birinchi qarash kerakligi bilinmaydi.
Vazifa (impeccable / emil-design-eng skill bilan tanqid qiling, keyin tuzating):
- Bo'sh holatni bitta joyda ayting: "5 ta darsdan 0 tasiga reja bor" va sarlavha yonida progress.
- Qatorda reja yo'q bo'lsa "Mavzu yozilmagan" o'rniga kursiv "+ mavzu qo'shish" (inline, sheet ochmasdan).
- Kurs rejasi bo'yicha keyingi mavzuni qatorda xira taklif qilib ko'rsating, bir bosishda qabul qilinsin.
- Klaviatura: ↑/↓ qatorlar bo'ylab, Enter ochadi, R "Tayyor" qiladi.
- "Keyingi kunlar: 12 ta dars" yopiq ro'yxat o'rniga hafta kunlari bo'yicha ixcham chiplar
  (Se 3 · Ch 4 · Pa 3 · Ju 2), bosilganda o'sha kun ochiladi.
Shartlar: DESIGN.md tokenlari, yangi rang qo'shmang. Kontrast WCAG AA.
Tayyor bo'lganda: oldin/keyin skrinshot, light va dark.
```

### 4. Takrorlanuvchi reja shablonlari

```
Vazifa: Bir xil fan bir nechta guruhda o'tiladi (Bulutli: S5, S8, S9-KT-22).
Bir guruh uchun yozilgan rejani "Boshqa guruhlarga ham" tugmasi bilan shu fanning keyingi darslariga
nusxalash imkoni. Allaqachon rejasi bor darslarga tegmang, nechta darsga qo'shilganini toast'da ayting.
Tayyor bo'lganda: Go testi va qo'lda sinov.
```

### 5. Global qidiruv (Ctrl K) kuchaytirish

```
Kontekst: Ctrl K palitrasi hozir faqat sahifalarga o'tadi (PALETTE_PAGES).
Vazifa: palitradan talaba, guruh, fan, qarzdor va harakatlarni ham toping:
"bugungi davomat", "keyingi dars rejasi", "Sinxronlash". Fuzzy qidiruv, o'zbekcha apostroflarni
(o' / o' / o`) bir xil deb hisoblang. Natijalar turi bo'yicha guruhlangan.
```

---

## P2. Tahlil va prognoz (yangi imkoniyatlar)

### 6. Kutilayotgan dars soatlari — jadval hali to'liq chiqmagan haftalar uchun

```
Kontekst: Saytdagi jadval faqat yaqin kunlarni beradi. Yuklama (data.load.items) har bir fan/guruh/tur
bo'yicha semestr soatlarini beradi, HOURS_PER_PARA = 2. 2-ATT-25 ning jadvali qat'iy
(Du–Pa, 3 va 4-para) va uning soatlari egasining bahosi.

Vazifa: "Yuklama" sahifasiga (yoki yangi "Prognoz" bo'limiga) keyingi 4 hafta uchun prognoz:
- Har hafta: kutilayotgan para soni va akademik soat.
- Manba uchta, aniq ajratilgan (PRODUCT.md 2-tamoyil):
  a) "Saytda" — jadvalda bor darslar (aniq);
  b) "Andoza bo'yicha" — oxirgi 2–3 haftaning haftalik takrorlanishidan (taxmin);
  c) "Yuklamadan" — qolgan soat / qolgan haftalar (taxmin).
  Taxminlar chiziqli, xira yoki "~" bilan ko'rsatilsin, hech qachon sayt raqami kabi emas.
- Har fan uchun: rejada X soat, o'tildi Y, qoldi Z, semestr oxirigacha N hafta → haftasiga kerakli tempo.
  Tempo hozirgidan past/yuqori bo'lsa ogohlantiring ("Bulutli: haftasiga 6 soat kerak, hozir 4").
- Andoza qanday hisoblanganini bitta jumlada tushuntiring.
Shartlar: hisob front'da yoki Go'da, lekin sof funksiya va testlangan. Bayramlar/bekor qilingan darslar
(api/cancelled) hisobga olinsin.
Tayyor bo'lganda: birlik testlari (to'liq hafta, yarim hafta, bekor qilingan dars, semestr oxiri).
```

### 7. Darslar intensivligi — haftalik issiqlik xaritasi

```
Vazifa: Dars jadvali sahifasida hafta × para (Du–Sha × 1–9) issiqlik xaritasi:
- Katak rangi = shu vaqtdagi darslar soni (0, 1, 2+ — ustma-ust qizil chegara bilan).
- Kun ustunida jami para va "eng uzun uzluksiz blok" (masalan, "4 para ketma-ket, tanaffussiz").
- Ogohlantirishlar: kunida 5+ para, 3+ para ketma-ket, kun 7–9-parada tugashi, ertasi 1-para bilan boshlanishi
  ("dam olish 12 soatdan kam").
- Hafta intensivlik indeksi: kontakt soatlar + tayyorgarlik taxmini (rejasi yo'q dars × 30 daq,
  sozlanadigan). Indeks oldingi haftalar bilan mini sparkline'da.
Shartlar: dataviz skill qoidalari, ranglar ikkala mavzuda AA, rang yagona signal bo'lmasin (raqam ham).
```

### 8. Semestr bo'yicha yuklama bajarilishi

```
Vazifa: Yuklama sahifasida har bir fan uchun "reja vs fakt" chizig'i (burn-up): x — haftalar,
y — o'tilgan soat; ideal chiziq (bir tekis tempo) va prognoz davomi (6-promptdagi hisob).
Semestr oxirida yuklama bajarilmay qolish xavfi bo'lsa sahifa tepasida bitta xulosa:
"Bulutli S9-KT-22: 8 soat orqada, 3 hafta qoldi".
```

### 9. Qarzlar (119) — ustuvorlik

```
Kontekst: Qarzlar sahifasida 119 ta yozuv, bitta raqam qo'rqitadi va harakatga undamaydi.
Vazifa: qarzlarni guruh va muddat bo'yicha guruhlang; eng ko'p qarzi bor 5 talaba; "bu hafta yopsa bo'ladigan"
qarzlar (keyingi darsda shu guruh bor) alohida. Badge'da umumiy son o'rniga "bu hafta: 12".
```

### 10. Oy oxiri — ustama va KPI tekshiruvi

```
Vazifa: oyning oxirgi 5 kunida Bosh sahifada "Oy yopilmoqda" kartasi: bajarilmagan ustama bandlari,
saqlanmagan davomat kunlari, KPI bandlari holati. Har birida bitta "ochish" harakati.
Hammasi tayyor bo'lsa karta yashirinadi.
```

### 11. Haftalik xulosa

```
Vazifa: Juma kuni (yoki talab bo'yicha) "Hafta yakuni": o'tilgan para/soat, rejasi bor darslar ulushi,
"o'tildi / qisman / qoldi" natijalari, ochiq qarzlar o'zgarishi, keyingi hafta prognozi (6-prompt)
va eng og'ir kun (7-prompt). Bitta sahifa, chop etishga yaroqli.
```

---

## P3. Sayqal (clean UI/UX)

### 12. To'liq UX audit

```
impeccable skill bilan butun ilovani audit qiling: har sahifa uchun
1) birinchi 3 soniyada foydalanuvchi nimani ko'radi va nima qilishi kerak;
2) takroriy matn va shovqin (bir xil chip/yozuv har qatorda);
3) bo'sh, yuklanayotgan, xato va eskirgan-ma'lumot holatlari;
4) klaviatura yo'llari va fokus tartibi;
5) kontrast (WCAG 2.1 AA), matn o'lchamlari, tabular raqamlar.
Natijani P0–P3 ustuvorlikda ro'yxat qiling, har biriga fayl:qator va aniq tuzatish.
Kodni o'zgartirmang, faqat hisobot (docs/audit/15_UX_AUDIT.md).
```

### 13. Worst-case ma'lumot bilan sinash

```
break-ui skill bilan Dars rejasi va Dars jadvali sahifalarini sinang: juda uzun fan nomi,
10 ta guruh birlashgan ma'ruza (S5-KT-22, S8-KT-22, ... ), bitta parada 3 ta dars, kun 9 para,
mavzusiz va 20 bandli reja, bo'sh semestr. Har bir buzilishni tuzatish bilan ayting.
```

### 14. Mikro-harakatlar

```
find-animation-opportunities skill: faqat ma'noli joylar — reja "Tayyor" bo'lganda chipning almashishi,
qator saqlanganda qisqa highlight, sheet ochilishi. Davomat belgilash kabi tezkor harakatlarga
animatsiya qo'shmang (sinfda tezlik muhim). prefers-reduced-motion hurmat qilinsin.
```

### 15. Bildirishnomalar

```
Vazifa: darsdan 15 daqiqa oldin brauzer bildirishnomasi (ruxsat bilan): "4-para 13:20, K4/309,
Algoritmlash 2-ATT-25 · reja: Tayyor" yoki "reja yo'q". Ustma-ust darslar bo'lsa ikkalasini ayting.
Bildirishnomalar sahifasida yoqish/o'chirish va vaqtni sozlash.
```

---

## Qanday ishlatish

1. Bitta promptni oling, Claude Code'ga bering (`next-version` tarmog'ida).
2. Avval reja so'rang: "Avval reja yoz, kodga tegma" — keyin tasdiqlang.
3. Har promptdan keyin `make check` va skrinshot.
4. Bajarilganini shu faylda ✅ bilan belgilang.

## Manbalar

- Prompt tuzilmasi (kontekst → dizayn maqsadi → aniq shartlar): [Rocket.new — dashboard UI prompts](https://www.rocket.new/blog/the-best-ai-prompts-for-dashboard-ui-components), [UXMagic — SaaS dashboard prompt templates](https://uxmagic.ai/blog/prompt-templates-saas-dashboards), [Flowstep — design prompts](https://flowstep.ai/blog/design-prompts)
- UX audit va accessibility promptlari: [ClickUp — UI/UX & accessibility prompts](https://clickup.com/p/ai-prompts/ui-ux-design-and-accessibility), [And Academy — UX prompts](https://www.andacademy.com/resources/?p=21563)
- Ustma-ust voqealar (yumshoq va qattiq konflikt, aniq nomlangan ogohlantirish, ikonka + hover): [techinterview — calendar conflict detection](https://techinterview.org/lld-calendar-app/), [Teamup — double booking](https://calendar.teamup.com/kb/double-booking-reservations/), [iiQ Events — double booking](https://iiqhcsupport.incidentiq.com/en/articles/12440954-iiq-events-double-booking), [Timely — avoid double bookings](https://gettimely.com/blog/avoid-double-bookings)
- O'qituvchi yuklamasi va intensivlik (kontakt soatdan tashqari ish, ketma-ket bloklar, dam olish oralig'i): [Deloitte — teacher time](https://www.deloitte.com/au/en/Industries/government-public/perspectives/designing-our-school-systems-around-students-and-their-teachers.html), [Smartble — balance teacher workload](https://www.smartble.net/blog/post/balance-teacher-workload-school-timetable/), [RevisionDojo — realistic teacher week](https://www.revisiondojo.com/blog/ib-teacher-workload-realistic-dp-week), [Cognito — teacher workload](https://cognito.org/blog/managing-teacher-workload)
