# Re-UI / Re-UX prompti

Bu prompt `attendance` ni qayta loyihalash uchun yozilgan va Claude Code o'zi uchun qabul qilib bajaradi.
Egasining qarori (2026-11-14): **uslub qoladi, UX qaytadan quriladi.** Navy sidebar, ko'k-kulrang yuzalar,
bitta brend ko'k, Public Sans va `DESIGN.md` tokenlari o'zgarmaydi. Sahifalar tuzilishi, ierarxiya,
oqimlar, zichlik va komponentlar qayta ko'riladi.

Tuzilma internetdagi eng samarali agent-dizayn ish oqimidan olingan (manbalar oxirida):
cheklovlarni oldindan qulflash → har bir ekranni skrinshot qilib nomlangan mezonlar bo'yicha audit →
muammolarni darajalash → cheklangan to'plamni tuzatish → qayta skrinshot → testlar xatti-harakatni qo'riqlaydi.

---

## Prompt

```
Rol: sen Apple Calendar / Reminders, Linear va Stripe Dashboard darajasidagi mahsulot dizayneri va
frontend muhandisisan. Rejim: Operate. Tashrif buyuruvchi vazifani bajarish uchun keladi; dizayn vazifaga xizmat qiladi.

KONTEKST (o'qi, o'zgartirma):
- PRODUCT.md: bitta foydalanuvchi, o'qituvchi; to'rtta real lahza (darsda, darsdan oldin, stolda, oy oxirida);
  5 tamoyil: diqqat talab qiladigan narsa birinchi, aniqlik darajasi halol, sinfda tez, hech narsa jimgina xato
  emas, universitetga faqat o'qish.
- DESIGN.md: vizual til qulflangan (tokenlar, shrift, shakl). Redesign uni almashtirmaydi.
- Texnik: vanilla JS (web/app.js), web/app.css, build yo'q, qat'iy CSP, faqat desktop (1024–1920), o'zbekcha matn.

QULFLANGAN (tegma):
- Ranglar, shrift, radiuslar, sidebar ko'rinishi, holat nomlari (Olingan / Olinmoqda / Tugatilmagan / Olinmagan,
  Reja yo'q / Reja bor / Tayyor, Noma'lum), "Honest status" qoidalari.
- Ma'lumot va API; saytga yozmaslik; davomat oqimining tezligi.
- Har bir e2e oqimi (scripts/e2e.mjs) va testlar o'tishi shart.

ISH TARTIBI:
1. Tasvir: demo serverni ishga tushir (attendance demo --no-login --with-site), har bir marshrutni
   1440×900 va 1280×720 da, yorug' va qorong'i mavzuda skrinshot qil.
2. Audit, har bir ekran uchun shu 7 mezon, 0–4 ball:
   a) 3 soniya testi: ekran ochilganda nima qilish kerakligi bir qarashda ko'rinadimi;
   b) ierarxiya: bitta narsa yetakchimi, yig'indilar jimmi;
   c) shovqin: har qatorda takrorlanadigan matn/chip, bir xil ma'noni ikki joyda aytish;
   d) holatlar: bo'sh, yuklanayotgan, xato, eskirgan, ustma-ust, to'liq bajarilgan;
   e) harakat narxi: asosiy vazifa nechta bosish/klaviatura bilan bajariladi;
   f) izchillik: bir xil narsa har sahifada bir xil ko'rinadimi (tugma, chip, sana, para);
   g) kirish imkoniyati: WCAG 2.1 AA kontrast, fokus, klaviatura yo'li, rang yagona signal emas.
3. Muammolarni P0 (vazifani buzadi) / P1 (sekinlashtiradi) / P2 (shovqin) / P3 (sayqal) ga ajrat.
   Faqat ekranda ko'rgan narsangni yoz; fayl:qator bilan.
4. Tuzat: bir aylanishda bitta sahifa, P0 va P1 dan boshlab. Har bir o'zgarish bitta sababga ega bo'lsin.
   Shablon tuyg'usini rad et: bir xil kartochkalar qatori, to'ldiruvchi raqamlar, ma'nosiz ikonka.
   Modal birinchi fikr emas: inline va progressive disclosure (details, sheet) afzal.
5. Tekshir: qayta skrinshot (ikkala mavzu, ikkala o'lcham), impeccable detect, make check.
   Ko'rinishda nima o'zgargani va nima uchunligini oldin/keyin bilan yoz.
6. Commit: sahifa bo'yicha, o'zbekcha xabar. DESIGN.md ga yangi qoida yoki komponent qo'shilsa yoz.

TARTIB: Dars rejasi → Dars jadvali → Bosh sahifa → Darslar → Talabalar → Qarzlar → Yuklama → Ilmiy KPI →
Ustama → Bildirishnomalar → Kabinet.

TAYYOR DEGANI:
- har bir sahifada birinchi qarashda "keyingi qadam" bor va u bitta;
- takroriy bo'sh-holat matni qatorlarda yo'q, u bir marta umumlashtiriladi;
- asosiy harakatlar klaviaturadan bajariladi;
- yorug'/qorong'i, 1280/1440 da toshish yo'q, kontrast AA;
- make check yashil.
```

---

## Manbalar

- Build → screenshot → critique → fix aylanishi, xatti-harakatni testlar bilan qulflash: [Rubric Labs — Can polish be automated?](https://website-injulle6u-rubriclabs.vercel.app/blog/iterative-improvement)
- Brauzerni agentga ko'rsatish, vizual fikr-mulohaza: [Tweag — Visual feedback workflow](https://tweag.github.io/agentic-coding-handbook/WORKFLOW_VISUAL_FEEDBACK)
- Bosqichma-bosqich audit (accessibility → ierarxiya → kontent): [UX Planet — Claude design critique](https://uxplanet.org/claude-design-critique-a-better-way-to-improve-ai-generated-ui-7efa1064bf8a), [Skills.lc — Design critique](https://www.skills.lc/shaunandrews/agent-skills/shaunandrews-agent-skills-skills-design-critique-skill-md)
- Shablon ko'rinishiga qarshi: [anti-ui-slop](https://skillselion.com/skills/uizze.com/anti-ui-slop)
- Cheklovlar va doimiy qoidalar fayli tezlikdan muhimroq: [Dylan Tao — redesigning with an AI agent](https://dylantao.github.io/blog/2026/website-redesign-ai-agent/)
- Vizual iterativ takomillashtirish (tadqiqot): [arXiv 2412.16829](https://arxiv.org/abs/2412.16829)
- Dashboard: avval maqsad, keyin metrika; ierarxiya; kognitiv yuk: [Tenet — dashboard UX](https://www.wearetenet.com/blog/dashboard-ux-design), [Orbix — dashboard best practices](https://www.orbix.studio/blogs/dashboard-design-best-practices), [DesignMonks — dashboard UX redesign](https://dev.to/designmonks/why-growing-saas-products-need-a-dashboard-ux-redesign-k3)
