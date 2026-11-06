// Strings for "Abood to the Moon" in Arabic (default, Emirati tone) and English, plus the language switch.
// Safe to import in node: every document / window / localStorage access is guarded.
//
// ---- exports ----
//   T(key, ...args)    string, or the result of a function-valued string; arrays come back as arrays; unknown key -> key
//   TL(key)            a random line from an array-valued string (robot banter, tips), never the same line twice in a row
//   nf(n)              en-US digits with commas in both languages; nf('+25') keeps the sign
//   lang() / getLang() 'ar' | 'en';  dir() 'rtl' | 'ltr'
//   setLang(l)         persists ('abood-lang', shared with Run, Abood! on purpose + the meta save), sets <html lang dir>,
//                      calls applyI18n(), dispatches window 'langchange' (detail: { lang })
//   applyI18n(root = document)  fills [data-i18n] textContent, [data-i18n-aria] aria-label, [data-i18n-title] title,
//                      renders the .lang flag pills (buttons with data-lang) like the old game; also sets document.title
//   applyLang()        = applyI18n(document) (old-game name)
//   onLang(fn)         callback after every language change
//   hasPickedLang() / hasStoredLang()   true once a language was chosen (show the picker otherwise)
//   upText(id, lv)     effect text of upgrade `id` at level `lv` (e.g. "Damage 1.6 · 5.2 shots/s")
//   FLAG               { ar, en } inline SVG flags;  STR  the raw tables;  KEYS  every key (sorted)
//
// ---- KEYS (both languages have exactly the same set) ----
// general   title kicker story story_short station n_abood n_nabeeh n_usta coins(n) cur arrow sec
// buttons   b_launch b_hangar b_suits b_missions b_badges b_help b_close b_back b_station b_next b_retry b_resume
//           b_quit b_menu b_ok b_fullscreen b_replay
// menu      m_journeys m_legs m_leg(i) m_legOf(i,n) m_locked m_lockedHint(name) m_done m_new m_replay m_reward(n)
//           m_bonus(n) m_route(a,b) m_best(n) m_legsDone(a,b) m_next(name) m_allDone
// bodies    p_earth p_moon p_mars p_venus p_belt p_jupiter p_saturn p_uranus p_neptune
// journeys  j_<id> j_<id>_d   for moon mars venus belt jupiter saturn uranus neptune
// legs      leg_<jid>_0 leg_<jid>_1 leg_<jid>_2
// HUD       h_score h_hull h_super h_superReady h_combo(n) h_shield h_rapid h_prog(a,b) hint
// a11y      a_pause a_sound a_super a_lang a_coins a_hp(n,m) a_close
// floating  f_meteor f_superReady f_repair f_shield f_shieldUp f_shieldPop f_cell f_rapid f_combo(n) f_newBest f_mission
//           f_badge(name) f_halfway f_lowhp f_legDone f_arrive(name) f_unlocked(name) f_coins(n) f_chain
// results   r_win r_arrive(name) r_fail r_failHint r_score r_best r_newBest r_kills r_picked r_reward r_replay r_bonus
//           r_total r_kept r_meteors r_hits r_noHit r_unlocked(name) r_badges r_missions r_none r_postcard(name)
//           r_factTitle r_tryUpgrade r_coinMult
// pause     pa_title pa_hint
// help      help_title help_story help_move help_fire help_super help_meteor help_hull help_shield help_coins
//           help_pickups help_hangar help_nabeeh help_legs help_keys
// rotate    rotate rotate_hint
// loader    ld_fonts ld_art ld_sound ld_cache ld_ready tips[]
// update    update updateBtn
// language  pickTitle pickHint lang_ar lang_en
// misc      ios sound pause fullscreen
// hangar    hg_title hg_note hg_tier(n) up_<id> up_<id>_d up_<id>_v(v)  (ids: blaster spread hull shield super engine
//           magnet nabeeh; v = M.upValue(id, lv), or use upText) up_lv(k,n) up_max up_buy(n) up_next up_now
//           bought notEnough shopNote
// suits     st_title st_note suit_<id> (white blue sand teal heat pilot gold) perk_heat perk_pilot perk_gold free wear
//           wearing badgeOnly buy(n) owned
// missions  ms_title ms_daily ms_note ms_bonus(n) ms_rocks(g) ms_coins(g) ms_legs(g) ms_supers(g) ms_meteors(g)
//           ms_noHit(g) ms_runRocks(g) ms_prog(a,b) ms_done claim claimed
// login     lg_title lg_day(n) lg_claim(n) lg_done lg_streak(n)
// badges    bg_title bg_tiered bg_count(a,b) bg_locked bg_reward(n) bg_prog(a,b) tier_0 tier_1 tier_2 tier_none tier_all
//           one-offs bg_<id> bg_<id>_d (first hangar moon mars saturn tour)
//           tiered  bc_<id> bc_<id>_d(g) (rocks meteors coins supers legs planets nohit)
// robots    bot_start bot_hit bot_meteor bot_super bot_combo bot_lowhp bot_win bot_lose bot_menu bot_arrive bot_shield
//           bot_pickup usta_lines usta_buy usta_poor usta_max   (arrays: use TL)
// facts     fact_earth fact_moon fact_mars fact_venus fact_belt fact_jupiter fact_saturn fact_uranus fact_neptune
import { upValue, settings, setSetting } from './meta.js';

export const nf = n => (typeof n === 'string' && n[0] === '+') ? '+' + nf(n.slice(1)) : Number(n).toLocaleString('en-US');
const pct = v => Math.round(v * 100);
// Arabic is the default language; English is one tap away on the flag button.
export const STR = {
  ar: {
    // ---- general ----
    title: 'عبود إلى القمر',
    kicker: 'نبيه جاهز، والسفينة جاهزة… وانت؟',
    story: 'عبود كبر وصار أصغر رائد فضاء في محطة فلك، فوق الأرض، وساكن هناك مع روبوته الذكي نبيه. حلمه من وهو صغير: يطير للقمر، وبعدين لكل كواكب المجموعة الشمسية! الأسطى يجهّز السفينة، ونبيه يحسب الطريق… والصخور والخردة والنيازك تنتظرهم.',
    story_short: 'من محطة فلك للقمر… وبعدين لكل الكواكب!',
    station: 'محطة فلك', n_abood: 'عبود', n_nabeeh: 'نبيه', n_usta: 'الأسطى',
    coins: n => `${nf(n)} د.إ`, cur: 'د.إ', arrow: '←', sec: ' ث',
    // ---- buttons ----
    b_launch: 'انطلق!', b_hangar: 'ورشة الأسطى', b_suits: 'البدلات', b_missions: 'المهمات', b_badges: 'الأوسمة', b_help: 'طريقة اللعب',
    b_close: 'إغلاق', b_back: 'رجوع', b_station: 'المحطة', b_next: 'المرحلة الياية', b_retry: 'حاول مرة ثانية', b_resume: 'كمّل',
    b_quit: 'ارجع للمحطة', b_menu: 'القائمة', b_ok: 'تمام', b_fullscreen: 'ملء الشاشة', b_replay: 'عيدها',
    // ---- menu ----
    m_journeys: 'رحلاتك', m_legs: 'المراحل', m_leg: i => `المرحلة ${nf(i + 1)}`, m_legOf: (i, n) => `المرحلة ${nf(i + 1)} من ${nf(n)}`,
    m_locked: 'مقفلة', m_lockedHint: name => `وصّل ${name} أول عشان تنفتح`, m_done: 'خلصت ✓', m_new: 'جديد!',
    m_replay: 'إعادة · ٤٠٪ من المكافأة', m_reward: n => `المكافأة ${nf(n)} د.إ`, m_bonus: n => `مكافأة الوصول ${nf(n)} د.إ`,
    m_route: (a, b) => `${a} ← ${b}`, m_best: n => `أفضل نتيجة: ${nf(n)}`, m_legsDone: (a, b) => `${nf(a)} من ${nf(b)}`,
    m_next: name => `الجاي: ${name}`, m_allDone: 'لفّيت المجموعة الشمسية كلها! عيد أي مرحلة وجمّع دراهم.',
    // ---- bodies ----
    p_earth: 'الأرض', p_moon: 'القمر', p_mars: 'المريخ', p_venus: 'الزهرة', p_belt: 'حزام الكويكبات',
    p_jupiter: 'المشتري', p_saturn: 'زحل', p_uranus: 'أورانوس', p_neptune: 'نبتون',
    // ---- journeys ----
    j_moon: 'القمر', j_moon_d: 'أول حلم: جارنا الفضّي',
    j_mars: 'المريخ', j_mars_d: 'على درب الأمل للكوكب الأحمر',
    j_venus: 'الزهرة', j_venus_d: 'حر وضباب برتقالي ونيازك وايد',
    j_belt: 'حزام الكويكبات', j_belt_d: 'صخور كبيرة وكريستال وايد = دراهم!',
    j_jupiter: 'المشتري', j_jupiter_d: 'العملاق والعواصف والثلج',
    j_saturn: 'زحل', j_saturn_d: 'حلقات من ثلج وغبار',
    j_uranus: 'أورانوس', j_uranus_d: 'برد أزرق وثلج سريع',
    j_neptune: 'نبتون', j_neptune_d: 'آخر كوكب وأصعب رحلة',
    // ---- legs ----
    leg_moon_0: 'مغادرة المدار', leg_moon_1: 'حلقة الخردة', leg_moon_2: 'الاقتراب من القمر',
    leg_mars_0: 'الفضاء العميق', leg_mars_1: 'سيل النيازك', leg_mars_2: 'الاقتراب الأحمر',
    leg_venus_0: 'صوب الشمس', leg_venus_1: 'الضباب البرتقالي', leg_venus_2: 'بوابة الحر',
    leg_belt_0: 'أول الحزام', leg_belt_1: 'متاهة الصخور', leg_belt_2: 'حقل الكريستال',
    leg_jupiter_0: 'الدرب الطويل', leg_jupiter_1: 'رياح العواصف', leg_jupiter_2: 'عين العملاق',
    leg_saturn_0: 'الثلج الطاير', leg_saturn_1: 'غبار الحلقات', leg_saturn_2: 'بين الحلقات',
    leg_uranus_0: 'البرد الأزرق', leg_uranus_1: 'الثلج السريع', leg_uranus_2: 'الكوكب المايل',
    leg_neptune_0: 'آخر المدارات', leg_neptune_1: 'رياح نبتون', leg_neptune_2: 'الحافة الزرقاء',
    // ---- HUD ----
    h_score: 'النقاط', h_hull: 'الهيكل', h_super: 'شعاع الأمل', h_superReady: 'جاهز!', h_combo: n => `×${n}`,
    h_shield: 'الدرع', h_rapid: 'رمي سريع', h_prog: (a, b) => `${a} ← ${b}`,
    hint: 'اسحب إصبعك فوق وتحت عشان تحرّك السفينة. المدفع يرمي بروحه!',
    // ---- a11y ----
    a_pause: 'إيقاف مؤقت', a_sound: 'الصوت والموسيقى', a_super: 'شعاع الأمل', a_lang: 'اللغة', a_coins: 'دراهمك',
    a_hp: (n, m) => `الهيكل ${nf(n)} من ${nf(m)}`, a_close: 'إغلاق',
    // ---- floating text ----
    f_meteor: 'نيزك!', f_superReady: 'شعاع الأمل جاهز!', f_repair: '+١ هيكل', f_shield: 'درع!', f_shieldUp: 'الدرع رجع',
    f_shieldPop: 'الدرع حماك!', f_cell: '+٣٥٪ شحنة', f_rapid: 'رمي سريع!', f_combo: n => `كومبو ×${n}`, f_newBest: 'رقم قياسي جديد!',
    f_mission: 'خلّصت مهمة!', f_badge: name => `وسام جديد: ${name}`, f_halfway: 'نص الطريق!', f_lowhp: 'الهيكل تعبان!',
    f_legDone: 'المرحلة خلصت!', f_arrive: name => `وصلنا ${name}!`, f_unlocked: name => `انفتحت رحلة ${name}!`, f_coins: n => `${nf(n)} د.إ`,
    f_chain: 'انفجار متسلسل!',
    // ---- results ----
    r_win: 'المرحلة خلصت!', r_arrive: name => `وصلت ${name}!`, r_fail: 'المهمة فشلت', r_failHint: 'الدراهم اللي جمعتها لك، والمكافأة تنتظرك المرة الياية.',
    r_score: 'النقاط', r_best: 'الأفضل', r_newBest: 'رقم قياسي جديد!', r_kills: 'كسّرت', r_picked: 'دراهم جمعتها', r_reward: 'مكافأة المرحلة',
    r_replay: 'مكافأة الإعادة (٤٠٪)', r_bonus: 'مكافأة الوصول', r_total: 'المجموع', r_kept: 'دراهم جمعتها', r_meteors: 'نيازك فلت منها',
    r_hits: 'صدمات', r_noHit: 'بدون ولا صدمة!', r_unlocked: name => `انفتحت رحلة جديدة: ${name}`, r_badges: 'أوسمة جديدة', r_missions: 'مهمات خلصتها',
    r_none: 'ما في شي جديد هالمرة.', r_postcard: name => `بطاقة من ${name}`, r_factTitle: 'تدري؟', r_tryUpgrade: 'جرّب تطوّر السفينة عند الأسطى!',
    r_coinMult: 'البدلة الذهبية: الدراهم ×١٫٢',
    // ---- pause ----
    pa_title: 'إيقاف مؤقت', pa_hint: 'اضغط «كمّل» أو P عشان ترجع للطيران',
    // ---- help ----
    help_title: 'طريقة اللعب', help_s_controls: 'التحكم', help_s_space: 'في الفضاء', help_s_ship: 'سفينتك', help_s_trips: 'الرحلات',
    help_story: 'كل رحلة لكوكب فيها ٣ مراحل. خلّص المرحلة الثالثة وتوصل الكوكب وتنفتح الرحلة الياية.',
    help_move: 'اسحب إصبعك فوق وتحت في أي مكان عشان تحرّك السفينة. على الكمبيوتر: ↑ ↓ أو W S.',
    help_fire: 'المدفع يرمي بروحه طول الوقت. كسّر الصخور والخردة واجمع النقاط.',
    help_super: 'لما تتعبى الدائرة، اضغط زر شعاع الأمل (أو مسافة / X): شعاع كبير يكسّر كل شي قدامك.',
    help_meteor: 'خط أحمر و«!» يعني نيزك جاي! ما ينكسر إلا بشعاع الأمل، فابعد عن الخط.',
    help_hull: 'كل صدمة تنقّص الهيكل نقطة، والنيزك نقطتين. لو خلص الهيكل تفشل المهمة، بس الدراهم اللي جمعتها لك.',
    help_shield: 'الدرع (من الأسطى) يصدّ صدمة وحدة ويرجع يتشحن بروحه.',
    help_coins: 'الصخور تطيّح دراهم، والصخور الكريستال تطيّح وايد. خزّان الوقود ينفجر ويكسّر اللي حواليه!',
    help_pickups: 'دوّر على: علبة التصليح (+١ هيكل)، خلية الدرع، خلية الطاقة (+٣٥٪ شعاع)، والرمي السريع.',
    help_hangar: 'الأسطى في الورشة يطوّر المدفع والهيكل والدرع والمحرك والمغناطيس ونبيه. السفينة تكبر وتحلو كل ما طوّرتها.',
    help_nabeeh: 'نبيه يطير جنبك وينبّهك من النيازك. طوّره ويصير يرمي ليزر، ويشفط الدراهم بعد.',
    help_legs: 'تقدر تعيد أي مرحلة خلصتها عشان تجمع دراهم (المكافأة ٤٠٪).',
    help_keys: 'P أو Esc: إيقاف مؤقت · M: الصوت',
    // ---- rotate ----
    rotate: 'لفّ التلفون بالعرض!', rotate_hint: 'السفينة تحتاج مكان تطير فيه',
    // ---- loader ----
    ld_fonts: 'نجهّز الخطوط…', ld_art: 'نرسم عبود ونبيه والكواكب…', ld_sound: 'نجهّز الأصوات…', ld_cache: 'نحفظ اللعبة للعب بدون نت…', ld_ready: 'جاهز!',
    tips: ['نصيحة: النيزك ما ينكسر إلا بشعاع الأمل.', 'نصيحة: الصخور الكريستال فيها دراهم وايد.', 'نصيحة: خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'نصيحة: عيد المراحل اللي خلصتها عشان تجمع دراهم.', 'نصيحة: الكومبو يرتفع لين ×٥ لو كسّرت ورا بعض.', 'نصيحة: الدرع يصدّ صدمة كاملة.',
      'نصيحة: خلّص مهمات اليوم وخذ دراهم زيادة.', 'نصيحة: حزام الكويكبات أحسن مكان تجمع فيه دراهم.'],
    // ---- update toast ----
    update: 'نسخة جديدة من اللعبة جاهزة', updateBtn: 'حدّث',
    // ---- language picker ----
    pickTitle: 'اختر اللغة', pickHint: 'تقدر تغيّرها بعدين من العلم فوق.', lang_ar: 'العربية', lang_en: 'English',
    // ---- misc ----
    ios: 'للّعب بملء الشاشة: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', sound: 'الصوت والموسيقى', pause: 'إيقاف مؤقت', fullscreen: 'ملء الشاشة',
    // ---- hangar ----
    hg_title: 'ورشة الأسطى', hg_note: 'كل تطوير يخلّي السفينة أقوى. هذا أحسن مكان تصرف فيه دراهمك.', hg_tier: n => `شكل السفينة ${nf(n)} من ٤`,
    up_blaster: 'المدفع', up_blaster_d: 'ضرر أقوى ورمي أسرع',
    up_blaster_v: v => `ضرر ${nf(v.dmg)} · ${nf(v.fireRate)} طلقة/ث`,
    up_spread: 'المدافع التوأم', up_spread_d: 'طلقات أكثر بالمرة، على شكل مروحة',
    up_spread_v: v => `${nf(v.guns)} ${v.guns === 1 ? 'طلقة' : 'طلقات'} بالمرة`,
    up_hull: 'درع الهيكل', up_hull_d: 'نقاط هيكل أكثر، تتحمل صدمات أكثر',
    up_hull_v: v => `${nf(v.maxHp)} نقاط هيكل`,
    up_shield: 'الدرع', up_shield_d: 'فقاعة تصدّ صدمة وحدة وترجع تتشحن',
    up_shield_v: v => v.shieldCd ? `يرجع بعد ${nf(v.shieldCd)} ث` : 'ما في درع',
    up_super: 'قلب الشعاع', up_super_d: 'شعاع الأمل يتشحن أسرع ويطوّل أكثر',
    up_super_v: v => `${nf(v.superDur)} ث · شحن ×${nf(v.superGain)}${v.superPassive ? ' · يتشحن بروحه' : ''}`,
    up_engine: 'المحرك', up_engine_d: 'السفينة تلحق إصبعك أسرع',
    up_engine_v: v => `استجابة ${nf(pct(v.follow / 9))}٪`,
    up_magnet: 'المغناطيس', up_magnet_d: 'يجذب الدراهم صوبك',
    up_magnet_v: v => v.magnet ? `المدى ${nf(v.magnet)}` : 'بدون مغناطيس',
    up_nabeeh: 'ذكاء نبيه', up_nabeeh_d: 'نبيه يرمي ليزر على الصخور، ومن المستوى ٣ يشفط الدراهم',
    up_nabeeh_v: v => v.rate ? `ليزر ${nf(v.rate)}/ث · ضرر ${nf(v.dmg)}${v.vacuum ? ' · يشفط الدراهم' : ''}${v.double ? ' · ليزر دبل' : ''}` : 'يطير جنبك وينبّهك',
    up_lv: (k, n) => `المستوى ${nf(k)} من ${nf(n)}`, up_max: 'أعلى مستوى ✓', up_buy: n => `طوّر · ${nf(n)} د.إ`, up_next: 'الجاي', up_now: 'الحين',
    bought: 'تم!', notEnough: 'ما عندك دراهم كفاية', shopNote: 'دراهم داخل اللعبة فقط. ما في دفع حقيقي.',
    // ---- suits ----
    st_title: 'البدلات', st_note: 'كل الألوان مجانية. تدفع بس في البدلات اللي لها ميزة.',
    suit_white: 'أبيض', suit_blue: 'أزرق سماوي', suit_sand: 'رملي', suit_teal: 'فيروزي غامق', suit_heat: 'بدلة الحرارة', suit_pilot: 'بدلة الطيار', suit_gold: 'البدلة الذهبية',
    perk_heat: '+١ نقطة هيكل', perk_pilot: 'شعاع الأمل يبدأ ٣٠٪ متعبي', perk_gold: 'الدراهم ×١٫٢ · من وسام زحل',
    free: 'مجاني', wear: 'البس', wearing: 'لابسها', badgeOnly: 'تنفتح بوسام', buy: n => `اشتر · ${nf(n)} د.إ`, owned: 'عندك',
    // ---- missions ----
    ms_title: 'المهمات', ms_daily: 'مهمات اليوم', ms_note: 'تتجدد كل يوم. استلم جوايزها من هني.', ms_bonus: n => `خلّص الثلاث اليوم: +${nf(n)} د.إ زيادة`,
    ms_rocks: g => `كسّر ${nf(g)} صخرة وخردة`, ms_coins: g => `اجمع ${nf(g)} د.إ`, ms_legs: g => g === 1 ? 'خلّص مرحلة وحدة' : `خلّص ${nf(g)} مراحل`,
    ms_supers: g => `استخدم شعاع الأمل ${nf(g)} مرات`, ms_meteors: g => `افلت من ${nf(g)} نيازك`, ms_noHit: () => 'خلّص مرحلة بدون ولا صدمة',
    ms_runRocks: g => `كسّر ${nf(g)} شي في مرحلة وحدة`, ms_prog: (a, b) => `${nf(a)} / ${nf(b)}`, ms_done: 'خلصت ✓', claim: 'استلم', claimed: 'تم ✓',
    // ---- login ----
    lg_title: 'هدية الدخول اليومية', lg_day: n => `اليوم ${nf(n)}`, lg_claim: n => `استلم ${nf(n)} د.إ`, lg_done: 'استلمت هدية اليوم. ارجع باجر!', lg_streak: n => `${nf(n)} أيام ورا بعض`,
    // ---- badges ----
    bg_title: 'الأوسمة', bg_tiered: 'كل وسام له ٣ مستويات: برونزي ثم فضي ثم ذهبي. كل مستوى يحتاج ١٠ أضعاف ويعطيك ١٠ أضعاف الدراهم.',
    bg_count: (a, b) => `${nf(a)} من ${nf(b)}`, bg_locked: 'مقفل', bg_reward: n => `+${nf(n)} د.إ`, bg_prog: (a, b) => `${nf(a)} من ${nf(b)}`,
    tier_0: 'برونزي', tier_1: 'فضي', tier_2: 'ذهبي', tier_none: 'لسه ما بديت', tier_all: 'كل المستويات ✓',
    bg_first: 'أول طيران', bg_first_d: 'طِر أول مرة من محطة فلك',
    bg_hangar: 'زبون الأسطى', bg_hangar_d: 'اشتر أول تطوير من الورشة',
    bg_moon: 'وصلنا القمر!', bg_moon_d: 'خلّص رحلة القمر',
    bg_mars: 'الكوكب الأحمر', bg_mars_d: 'خلّص رحلة المريخ',
    bg_saturn: 'سيد الحلقات', bg_saturn_d: 'خلّص رحلة زحل، وتفتح لك البدلة الذهبية',
    bg_tour: 'الجولة الكبرى', bg_tour_d: 'وصّل نبتون، آخر كوكب!',
    bc_rocks: 'مكسّر الصخور', bc_rocks_d: g => `كسّر ${nf(g)} صخرة وخردة`,
    bc_meteors: 'ضد النيازك', bc_meteors_d: g => `افلت من ${nf(g)} نيزك`,
    bc_coins: 'جامع الدراهم', bc_coins_d: g => `اجمع ${nf(g)} د.إ في الطيران`,
    bc_supers: 'شعاع الأمل', bc_supers_d: g => `استخدم الشعاع ${nf(g)} مرة`,
    bc_legs: 'الطيار المداوم', bc_legs_d: g => `خلّص ${nf(g)} مرحلة`,
    bc_planets: 'المستكشف', bc_planets_d: g => `وصّل كوكب ${nf(g)} مرة`,
    bc_nohit: 'ولا خدش', bc_nohit_d: g => `خلّص ${nf(g)} مرحلة بدون ولا صدمة`,
    // ---- robots: Nabeeh (cheeky, smart) ----
    bot_start: ['يلا يا عبود، اربط الحزام!', 'الأنظمة كلها تمام… تقريبًا.', 'جاهز يا كابتن؟ أنا جاهز من أمس!', 'حسبت الطريق ١٠٠ مرة، وطلع زين.',
      'بسم الله، انطلقنا!', 'تذكّر: الصخور ما تعرف تقول آسفة.', 'ماما على الراديو تقول: لا تتأخرون على العشا!', 'شغّلت الرادار، والمكيف بعد.'],
    bot_hit: ['آخ! هذي جت في الجناح!', 'انتبه! السفينة مب سيارة صدامات!', 'ما عليه، الأسطى بيصلحها.', 'صخرة قليلة أدب!', 'أوف! حسيتها في دوايري.',
      'شوي شوي، ترى الهيكل يحس!', 'ركّز يا كابتن!', 'هذي الصخرة ما شافت الإشارة.'],
    bot_meteor: ['نيزك! اطلع ولا انزل، بس لا توقف!', 'انتبه! نيزك جاي بسرعة الصاروخ!', 'شي يولّع جاي! تحرّك!', 'نيزك! ما ينكسر إلا بالشعاع!',
      'هذا مب صخرة، هذا نار طايرة!', 'الخط الأحمر يعني ابعد عنه!'],
    bot_super: ['شعاع الأمل جاهز! اضغط الزر الكبير!', 'يلا! ورّهم شعاع الأمل!', 'الشحنة فل! خلّها تلمع!', 'وااو! شوف كيف تذوب الصخور!',
      'هذا الشعاع أقوى من شمس الظهر في الصيف!', 'نوّرت الفضا كله!'],
    bot_combo: ['كومبو! انت نار!', 'ورا بعض ورا بعض! كمّل!', 'يا سلام عليك يا عبود!', 'حتى أنا ما أحسبها بهالسرعة!', 'هذا لعب محترفين!',
      'كمّل كمّل، الدراهم تحبك!', 'دوايري ترقص من الفرحة!'],
    bot_lowhp: ['الهيكل تعبان! دوّر على علبة التصليح!', 'تحذير: السفينة صارت مثل علبة عصير مدعوسة.', 'شوي بعد ونصير قطع غيار! انتبه!',
      'خلّك بعيد عن الصخور الحين!', 'وضعنا حرج… بس أنا واثق فيك!', 'لو ماما تشوفنا الحين بتعصب!'],
    bot_win: ['خلّصنا المرحلة! أنا فخور فيك!', 'هبّة! عدّينا سالمين!', 'يا سلام! الأسطى بيفرح بالدراهم.', 'مبروك يا كابتن! نستاهل استراحة.',
      'سجّلتها في ذاكرتي: عبود بطل!', 'رحلة زينة! بس لا تقول للصخور.'],
    bot_lose: ['ما عليه، كل رواد الفضا يطيحون مرة!', 'السفينة تكسّرت… بس الدراهم معانا!', 'خلّنا نرجع للأسطى ونطوّر السفينة.',
      'المرة الياية بنسويها! متأكد ٩٩٪.', 'لا تزعل، حتى القمر يختفي ويرجع كل شهر!', 'أنصحك كصديق: طوّر الدرع.'],
    bot_menu: ['تدري؟ النيزك ما ينكسر إلا بشعاع الأمل.', 'الصخور الكريستال فيها دراهم وايد!', 'خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'عيد المراحل عشان تجمع دراهم أكثر.', 'الأسطى يقدر يركّب لي ليزر… لو تدفع!', 'خلّص مهمات اليوم وخذ دراهم زيادة.',
      'أنا نبيه، واليوم أحس إني نبيه زيادة.', 'القمر ينتظرنا، والقهوة بعد.', 'ماما اتصلت تسأل: أكلت؟ قلت لها: بعد شوي!'],
    bot_arrive: ['شوف! الكوكب قدامنا!', 'دخلنا المدار! صوّر صوّر!', 'حلم عبود صار حقيقة!', 'بطاقة جديدة للمجموعة!'],
    bot_shield: ['الدرع صدّها!', 'الدرع شغّال، ولا يهمك!', 'فقاعتي حمتك!'],
    bot_pickup: ['زين! خذها!', 'هذي تنفعنا!', 'هدية من الفضا!'],
    // ---- robots: Usta (hangar) ----
    usta_lines: ['هلا والله بالكابتن! شو نركّب اليوم؟', 'المدفع يبا له تطوير، صدقني.', 'السفينة هذي غالية علي مثل ولدي.', 'كل مسمار هني له قصة.',
      'الدرع يحميك، والدرع يبا دراهم.', 'نبيه يبا ليزر؟ خلّه يقول من فضلك.', 'مفتاحي جاهز، وانت؟', 'لا تنسى: المحرك الزين يخليك تفلت من النيازك.'],
    usta_buy: ['تم! السفينة صارت أقوى.', 'شغل نظيف، مثل العادة.', 'اسمع صوت المحرك… فخامة!', 'ركّبناها! جرّبها في الفضا.'],
    usta_poor: ['الدراهم ما تكفي يا كابتن، روح جيب صخور كريستال.', 'ما يصير بالدين، هههه!', 'عيد كم مرحلة وتعال.'],
    usta_max: ['هذا أعلى شي عندي! ما في أقوى منه.', 'خلاص، هذي فل الفل!'],
    // ---- postcard facts (real, kid-friendly) ----
    fact_earth: 'الأرض لونها أزرق من الفضا لأن الماي يغطي تقريبًا ٧٠٪ منها.',
    fact_moon: 'القمر يبعد عن الأرض تقريبًا ٣٨٤ ألف كيلومتر، ونشوف منه دايمًا نفس الوجه!',
    fact_mars: 'المريخ أحمر لأن ترابه فيه صدأ، وفيه أعلى بركان في المجموعة الشمسية: أوليمبوس مونس.',
    fact_venus: 'الزهرة أحر كوكب في المجموعة الشمسية، حرارتها تذوّب الرصاص! وهي أحر من عطارد مع إنه أقرب للشمس.',
    fact_belt: 'حزام الكويكبات بين المريخ والمشتري فيه ملايين الصخور، بس المسافات بينها كبيرة وايد، والمركبات الحقيقية تعدّي من بينها بسلام.',
    fact_jupiter: 'المشتري أكبر كوكب، والبقعة الحمراء العظيمة فيه عاصفة أكبر من كوكب الأرض كله!',
    fact_saturn: 'حلقات زحل مصنوعة من قطع ثلج وصخر، بعضها صغير مثل حبة الرمل وبعضها كبير مثل البيت.',
    fact_uranus: 'أورانوس يدور على جنبه، كأنه كورة تتدحرج حول الشمس!',
    fact_neptune: 'في نبتون أسرع رياح في المجموعة الشمسية، توصل تقريبًا ٢٠٠٠ كيلومتر في الساعة!',
  },
  en: {
    // ---- general ----
    title: 'Abood to the Moon',
    kicker: 'Nabeeh is ready, the ship is ready… are you?',
    story: 'Abood grew up to be the youngest astronaut on Falak Station, high above Earth, where he lives with his clever robot Nabeeh. His dream since he was little: fly to the Moon, and then to every planet! Usta gets the ship ready, Nabeeh works out the route… and rocks, space junk and meteors are waiting.',
    story_short: 'From Falak Station to the Moon… and then every planet!',
    station: 'Falak Station', n_abood: 'Abood', n_nabeeh: 'Nabeeh', n_usta: 'Usta',
    coins: n => `AED ${nf(n)}`, cur: 'AED', arrow: '→', sec: 's',
    // ---- buttons ----
    b_launch: 'Launch!', b_hangar: "Usta's hangar", b_suits: 'Suits', b_missions: 'Missions', b_badges: 'Badges', b_help: 'How to play',
    b_close: 'Close', b_back: 'Back', b_station: 'Station', b_next: 'Next leg', b_retry: 'Try again', b_resume: 'Resume',
    b_quit: 'Back to station', b_menu: 'Menu', b_ok: 'OK', b_fullscreen: 'Fullscreen', b_replay: 'Replay',
    // ---- menu ----
    m_journeys: 'Your journeys', m_legs: 'Legs', m_leg: i => `Leg ${nf(i + 1)}`, m_legOf: (i, n) => `Leg ${nf(i + 1)} of ${nf(n)}`,
    m_locked: 'Locked', m_lockedHint: name => `Reach ${name} first to unlock`, m_done: 'Done ✓', m_new: 'New!',
    m_replay: 'Replay · 40% of the reward', m_reward: n => `Reward AED ${nf(n)}`, m_bonus: n => `Arrival bonus AED ${nf(n)}`,
    m_route: (a, b) => `${a} → ${b}`, m_best: n => `Best score: ${nf(n)}`, m_legsDone: (a, b) => `${nf(a)} of ${nf(b)}`,
    m_next: name => `Next: ${name}`, m_allDone: 'You toured the whole solar system! Replay any leg to collect dirhams.',
    // ---- bodies ----
    p_earth: 'Earth', p_moon: 'the Moon', p_mars: 'Mars', p_venus: 'Venus', p_belt: 'the Asteroid Belt',
    p_jupiter: 'Jupiter', p_saturn: 'Saturn', p_uranus: 'Uranus', p_neptune: 'Neptune',
    // ---- journeys ----
    j_moon: 'The Moon', j_moon_d: 'The first dream: our silver neighbour',
    j_mars: 'Mars', j_mars_d: 'Along the path of hope to the red planet',
    j_venus: 'Venus', j_venus_d: 'Heat, orange haze and lots of meteors',
    j_belt: 'Asteroid Belt', j_belt_d: 'Big rocks and loads of crystals = dirhams!',
    j_jupiter: 'Jupiter', j_jupiter_d: 'The giant, its storms and ice',
    j_saturn: 'Saturn', j_saturn_d: 'Rings of ice and dust',
    j_uranus: 'Uranus', j_uranus_d: 'Blue cold, fast ice',
    j_neptune: 'Neptune', j_neptune_d: 'The last planet, the hardest trip',
    // ---- legs ----
    leg_moon_0: 'Leaving orbit', leg_moon_1: 'The junk ring', leg_moon_2: 'Lunar approach',
    leg_mars_0: 'Deep space', leg_mars_1: 'Meteor stream', leg_mars_2: 'Red approach',
    leg_venus_0: 'Toward the Sun', leg_venus_1: 'Orange haze', leg_venus_2: 'Gate of heat',
    leg_belt_0: 'Edge of the belt', leg_belt_1: 'Rock maze', leg_belt_2: 'Crystal field',
    leg_jupiter_0: 'The long road', leg_jupiter_1: 'Storm winds', leg_jupiter_2: 'Eye of the giant',
    leg_saturn_0: 'Flying ice', leg_saturn_1: 'Ring dust', leg_saturn_2: 'Through the rings',
    leg_uranus_0: 'Blue cold', leg_uranus_1: 'Fast ice', leg_uranus_2: 'The tilted planet',
    leg_neptune_0: 'The last orbits', leg_neptune_1: "Neptune's winds", leg_neptune_2: 'The blue edge',
    // ---- HUD ----
    h_score: 'Score', h_hull: 'Hull', h_super: 'Amal Beam', h_superReady: 'Ready!', h_combo: n => `×${n}`,
    h_shield: 'Shield', h_rapid: 'Rapid fire', h_prog: (a, b) => `${a} → ${b}`,
    hint: 'Drag up and down to move the ship. The blaster fires by itself!',
    // ---- a11y ----
    a_pause: 'Pause', a_sound: 'Sound and music', a_super: 'Amal Beam', a_lang: 'Language', a_coins: 'Your dirhams',
    a_hp: (n, m) => `Hull ${nf(n)} of ${nf(m)}`, a_close: 'Close',
    // ---- floating text ----
    f_meteor: 'Meteor!', f_superReady: 'Amal Beam ready!', f_repair: '+1 hull', f_shield: 'Shield!', f_shieldUp: 'Shield back up',
    f_shieldPop: 'The shield saved you!', f_cell: '+35% charge', f_rapid: 'Rapid fire!', f_combo: n => `Combo ×${n}`, f_newBest: 'New best!',
    f_mission: 'Mission done!', f_badge: name => `New badge: ${name}`, f_halfway: 'Halfway there!', f_lowhp: 'Hull is weak!',
    f_legDone: 'Leg complete!', f_arrive: name => `We reached ${name}!`, f_unlocked: name => `New journey: ${name}!`, f_coins: n => `AED ${nf(n)}`,
    f_chain: 'Chain blast!',
    // ---- results ----
    r_win: 'Leg complete!', r_arrive: name => `You reached ${name}!`, r_fail: 'Mission failed', r_failHint: 'You keep the dirhams you picked up. The reward is waiting for next time.',
    r_score: 'Score', r_best: 'Best', r_newBest: 'New best!', r_kills: 'Destroyed', r_picked: 'Dirhams picked up', r_reward: 'Leg reward',
    r_replay: 'Replay reward (40%)', r_bonus: 'Arrival bonus', r_total: 'Total', r_kept: 'Dirhams picked up', r_meteors: 'Meteors dodged',
    r_hits: 'Hits', r_noHit: 'Not a single hit!', r_unlocked: name => `New journey unlocked: ${name}`, r_badges: 'New badges', r_missions: 'Missions done',
    r_none: 'Nothing new this time.', r_postcard: name => `Postcard from ${name}`, r_factTitle: 'Did you know?', r_tryUpgrade: 'Try upgrading the ship at Usta’s hangar!',
    r_coinMult: 'Gold suit: dirhams ×1.2',
    // ---- pause ----
    pa_title: 'Paused', pa_hint: 'Tap Resume or press P to fly again',
    // ---- help ----
    help_title: 'How to play', help_s_controls: 'Controls', help_s_space: 'Out in space', help_s_ship: 'Your ship', help_s_trips: 'Journeys',
    help_story: 'Every journey to a planet has 3 legs. Finish the third leg to reach the planet and unlock the next journey.',
    help_move: 'Drag up and down anywhere to move the ship. On a computer: ↑ ↓ or W S.',
    help_fire: 'The blaster fires by itself all the time. Smash rocks and junk to score.',
    help_super: 'When the ring is full, press the Amal Beam button (or Space / X): a huge beam that destroys everything in front of you.',
    help_meteor: 'A red line and a "!" mean a meteor is coming! Only the Amal Beam can break it, so get out of its lane.',
    help_hull: 'Every hit costs 1 hull point, a meteor costs 2. If the hull runs out the mission fails, but you keep the dirhams you picked up.',
    help_shield: 'The shield (from Usta) blocks one hit, then recharges by itself.',
    help_coins: 'Rocks drop dirhams, and crystal rocks drop lots. Fuel tanks explode and break everything around them!',
    help_pickups: 'Look out for: repair kits (+1 hull), shield cells, power cells (+35% beam) and rapid fire.',
    help_hangar: 'Usta in the hangar upgrades the blaster, hull, shield, engine, magnet and Nabeeh. The ship grows cooler as you upgrade it.',
    help_nabeeh: 'Nabeeh flies next to you and warns you about meteors. Upgrade him and he fires a laser, and later vacuums up dirhams too.',
    help_legs: 'You can replay any leg you finished to collect more dirhams (40% of the reward).',
    help_keys: 'P or Esc: pause · M: sound',
    // ---- rotate ----
    rotate: 'Turn your phone sideways!', rotate_hint: 'The ship needs room to fly',
    // ---- loader ----
    ld_fonts: 'Loading fonts…', ld_art: 'Drawing Abood, Nabeeh and the planets…', ld_sound: 'Tuning the sounds…', ld_cache: 'Saving the game to play offline…', ld_ready: 'Ready!',
    tips: ['Tip: only the Amal Beam can break a meteor.', 'Tip: crystal rocks are full of dirhams.', 'Tip: fuel tanks explode and break what is around them.',
      'Tip: replay legs you finished to collect dirhams.', 'Tip: smash things one after another to raise the combo up to ×5.', 'Tip: the shield blocks a whole hit.',
      "Tip: finish today's missions for extra dirhams.", 'Tip: the Asteroid Belt is the best place to collect dirhams.'],
    // ---- update toast ----
    update: 'A new version of the game is ready', updateBtn: 'Update',
    // ---- language picker ----
    pickTitle: 'Choose your language', pickHint: 'You can change it later with the flag at the top.', lang_ar: 'العربية', lang_en: 'English',
    // ---- misc ----
    ios: 'To play fullscreen: tap the Share button, then "Add to Home Screen".', sound: 'Sound and music', pause: 'Pause', fullscreen: 'Fullscreen',
    // ---- hangar ----
    hg_title: "Usta's hangar", hg_note: 'Every upgrade makes the ship stronger. The best place to spend your dirhams.', hg_tier: n => `Ship look ${nf(n)} of 4`,
    up_blaster: 'Blaster', up_blaster_d: 'Harder hits, faster shots',
    up_blaster_v: v => `Damage ${nf(v.dmg)} · ${nf(v.fireRate)} shots/s`,
    up_spread: 'Twin guns', up_spread_d: 'More bolts per shot, in a fan',
    up_spread_v: v => `${nf(v.guns)} ${v.guns === 1 ? 'bolt' : 'bolts'} per shot`,
    up_hull: 'Hull armour', up_hull_d: 'More hull points to take more hits',
    up_hull_v: v => `${nf(v.maxHp)} hull points`,
    up_shield: 'Shield', up_shield_d: 'A bubble that blocks one hit, then recharges',
    up_shield_v: v => v.shieldCd ? `Recharges in ${nf(v.shieldCd)}s` : 'No shield',
    up_super: 'Super core', up_super_d: 'The Amal Beam charges faster and lasts longer',
    up_super_v: v => `${nf(v.superDur)}s · charge ×${nf(v.superGain)}${v.superPassive ? ' · self-charging' : ''}`,
    up_engine: 'Engine', up_engine_d: 'The ship follows your finger faster',
    up_engine_v: v => `Response ${nf(pct(v.follow / 9))}%`,
    up_magnet: 'Magnet', up_magnet_d: 'Pulls dirhams toward you',
    up_magnet_v: v => v.magnet ? `Range ${nf(v.magnet)}` : 'No magnet',
    up_nabeeh: 'Nabeeh AI', up_nabeeh_d: 'Nabeeh fires a laser at rocks, and from level 3 vacuums up dirhams',
    up_nabeeh_v: v => v.rate ? `Laser ${nf(v.rate)}/s · damage ${nf(v.dmg)}${v.vacuum ? ' · vacuums dirhams' : ''}${v.double ? ' · double laser' : ''}` : 'Flies with you and warns you',
    up_lv: (k, n) => `Level ${nf(k)} of ${nf(n)}`, up_max: 'Max level ✓', up_buy: n => `Upgrade · AED ${nf(n)}`, up_next: 'Next', up_now: 'Now',
    bought: 'Done!', notEnough: 'Not enough dirhams', shopNote: 'In-game dirhams only. No real payments.',
    // ---- suits ----
    st_title: 'Suits', st_note: 'All colours are free. You only pay for suits with a perk.',
    suit_white: 'White', suit_blue: 'Sky blue', suit_sand: 'Sand', suit_teal: 'Dark teal', suit_heat: 'Heat suit', suit_pilot: 'Pilot suit', suit_gold: 'Gold suit',
    perk_heat: '+1 hull point', perk_pilot: 'The Amal Beam starts 30% charged', perk_gold: 'Dirhams ×1.2 · from the Saturn badge',
    free: 'Free', wear: 'Wear', wearing: 'Wearing', badgeOnly: 'Unlocked by a badge', buy: n => `Buy · AED ${nf(n)}`, owned: 'Owned',
    // ---- missions ----
    ms_title: 'Missions', ms_daily: "Today's missions", ms_note: 'New ones every day. Claim the rewards here.', ms_bonus: n => `Finish all three today: +AED ${nf(n)} extra`,
    ms_rocks: g => `Destroy ${nf(g)} rocks and junk`, ms_coins: g => `Pick up AED ${nf(g)}`, ms_legs: g => g === 1 ? 'Finish a leg' : `Finish ${nf(g)} legs`,
    ms_supers: g => `Use the Amal Beam ${nf(g)} times`, ms_meteors: g => `Dodge ${nf(g)} meteors`, ms_noHit: () => 'Finish a leg without a single hit',
    ms_runRocks: g => `Destroy ${nf(g)} things in one leg`, ms_prog: (a, b) => `${nf(a)} / ${nf(b)}`, ms_done: 'Done ✓', claim: 'Claim', claimed: 'Claimed ✓',
    // ---- login ----
    lg_title: 'Daily login gift', lg_day: n => `Day ${nf(n)}`, lg_claim: n => `Claim AED ${nf(n)}`, lg_done: "You got today's gift. Come back tomorrow!", lg_streak: n => `${nf(n)} days in a row`,
    // ---- badges ----
    bg_title: 'Badges', bg_tiered: 'Each badge has 3 tiers: bronze, then silver, then gold. Each tier needs 10 times more and pays 10 times the dirhams.',
    bg_count: (a, b) => `${nf(a)} of ${nf(b)}`, bg_locked: 'Locked', bg_reward: n => `+AED ${nf(n)}`, bg_prog: (a, b) => `${nf(a)} of ${nf(b)}`,
    tier_0: 'Bronze', tier_1: 'Silver', tier_2: 'Gold', tier_none: 'Not started yet', tier_all: 'All tiers ✓',
    bg_first: 'First flight', bg_first_d: 'Fly out of Falak Station for the first time',
    bg_hangar: "Usta's customer", bg_hangar_d: 'Buy your first upgrade in the hangar',
    bg_moon: 'Moon reached!', bg_moon_d: 'Finish the journey to the Moon',
    bg_mars: 'The red planet', bg_mars_d: 'Finish the journey to Mars',
    bg_saturn: 'Lord of the rings', bg_saturn_d: 'Finish the journey to Saturn to unlock the gold suit',
    bg_tour: 'Grand tour', bg_tour_d: 'Reach Neptune, the last planet!',
    bc_rocks: 'Rock smasher', bc_rocks_d: g => `Destroy ${nf(g)} rocks and junk`,
    bc_meteors: 'Meteor dodger', bc_meteors_d: g => `Dodge ${nf(g)} meteors`,
    bc_coins: 'Dirham collector', bc_coins_d: g => `Pick up AED ${nf(g)} in flight`,
    bc_supers: 'Amal Beam', bc_supers_d: g => `Use the beam ${nf(g)} times`,
    bc_legs: 'Frequent flyer', bc_legs_d: g => `Finish ${nf(g)} legs`,
    bc_planets: 'Explorer', bc_planets_d: g => `Reach a planet ${nf(g)} times`,
    bc_nohit: 'Not a scratch', bc_nohit_d: g => `Finish ${nf(g)} legs without a hit`,
    // ---- robots: Nabeeh (cheeky, smart) ----
    bot_start: ['Buckle up, Abood!', 'All systems OK… mostly.', 'Ready, captain? I was ready yesterday!', 'I checked the route 100 times. It looks good.',
      "Bismillah, here we go!", "Remember: rocks don't say sorry.", 'Mama on the radio says: don’t be late for dinner!', 'Radar on. Air conditioning too.'],
    bot_hit: ['Ouch! That hit the wing!', "Careful! The ship isn't a bumper car!", "No worries, Usta will fix it.", 'Rude rock!', 'Oof! I felt that in my circuits.',
      'Easy, easy, the hull has feelings!', 'Focus, captain!', "That rock didn't see the signal."],
    bot_meteor: ["Meteor! Go up or down, just don't stop!", 'Watch out! A meteor coming at rocket speed!', 'Something on fire is coming! Move!', 'Meteor! Only the beam can break it!',
      "That's not a rock, that's flying fire!", 'Red line means stay away!'],
    bot_super: ['Amal Beam ready! Press the big button!', 'Go on! Show them the Amal Beam!', 'Fully charged! Let it shine!', 'Woah! Look at the rocks melt!',
      'That beam is brighter than a summer noon!', 'You lit up all of space!'],
    bot_combo: ["Combo! You're on fire!", 'One after another! Keep going!', 'Bravo, Abood!', "Even I can't count that fast!", "That's pro flying!",
      'Keep going, the dirhams love you!', 'My circuits are dancing!'],
    bot_lowhp: ['Hull is weak! Find a repair kit!', 'Warning: the ship looks like a squashed juice box.', 'A bit more and we become spare parts! Careful!',
      'Stay away from the rocks now!', "It's serious… but I believe in you!", 'If Mama saw us now she would be so cross!'],
    bot_win: ["Leg done! I'm proud of you!", 'Woohoo! Made it in one piece!', 'Yes! Usta will love these dirhams.', 'Well done, captain! We earned a break.',
      'Saved to my memory: Abood is a hero!', "Great trip! Just don't tell the rocks."],
    bot_lose: ['No worries, every astronaut crashes once!', 'The ship broke… but we kept the dirhams!', "Let's go back to Usta and upgrade the ship.",
      "Next time we'll make it! I'm 99% sure.", "Don't be sad, even the Moon disappears and comes back every month!", 'Friendly advice: upgrade the shield.'],
    bot_menu: ['Did you know? Only the Amal Beam can break a meteor.', 'Crystal rocks are full of dirhams!', 'Fuel tanks explode and break what is around them.',
      'Replay legs to collect more dirhams.', 'Usta can fit me with a laser… if you pay!', "Finish today's missions for extra dirhams.",
      'I am Nabeeh, and today I feel extra clever.', 'The Moon is waiting for us. So is the coffee.', 'Mama called to ask: did you eat? I said: soon!'],
    bot_arrive: ['Look! The planet is right there!', "We're in orbit! Take a photo!", "Abood's dream came true!", 'A new postcard for the collection!'],
    bot_shield: ['The shield blocked it!', 'Shield is on, no worries!', 'My bubble saved you!'],
    bot_pickup: ['Nice! Grab it!', "That'll help!", 'A gift from space!'],
    // ---- robots: Usta (hangar) ----
    usta_lines: ['Welcome, captain! What shall we fit today?', 'Your blaster needs an upgrade, trust me.', 'This ship is like a son to me.', 'Every bolt here has a story.',
      'The shield protects you, and the shield needs dirhams.', 'Nabeeh wants a laser? Tell him to say please.', 'My wrench is ready. Are you?', "Don't forget: a good engine helps you dodge meteors."],
    usta_buy: ['Done! The ship is stronger now.', 'Clean work, as always.', 'Listen to that engine… beautiful!', 'Fitted! Try it out in space.'],
    usta_poor: ['Not enough dirhams, captain. Go find some crystal rocks.', 'No credit here, haha!', 'Replay a few legs and come back.'],
    usta_max: ["That's the best I've got! Nothing stronger.", "That's it, top of the top!"],
    // ---- postcard facts (real, kid-friendly) ----
    fact_earth: 'From space, Earth looks blue because water covers about 70% of it.',
    fact_moon: 'The Moon is about 384,000 km from Earth, and we always see the same side of it!',
    fact_mars: 'Mars is red because its dust is full of rust, and it has the tallest volcano in the solar system: Olympus Mons.',
    fact_venus: 'Venus is the hottest planet in the solar system, hot enough to melt lead! It is even hotter than Mercury, which is closer to the Sun.',
    fact_belt: 'The Asteroid Belt between Mars and Jupiter has millions of rocks, but they are so far apart that real spacecraft fly through safely.',
    fact_jupiter: 'Jupiter is the biggest planet, and its Great Red Spot is a storm bigger than the whole Earth!',
    fact_saturn: "Saturn's rings are made of chunks of ice and rock, some as small as a grain of sand and some as big as a house.",
    fact_uranus: 'Uranus spins on its side, like a ball rolling around the Sun!',
    fact_neptune: 'Neptune has the fastest winds in the solar system, nearly 2,000 km per hour!',
  },
};
export const KEYS = Object.keys(STR.ar).sort();

// Flags shown on the switch.
export const FLAG = {
  en: '<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="ukS"><path d="M0,0v30h60V0z"/></clipPath><clipPath id="ukT"><path d="M30,15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#ukS)"><path d="M0,0v30h60V0z" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#ukT)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></g></svg>',
  ar: '<svg viewBox="0 0 12 6" aria-hidden="true"><rect width="12" height="2" fill="#00732f"/><rect y="2" width="12" height="2" fill="#fff"/><rect y="4" width="12" height="2" fill="#000"/><rect width="3" height="6" fill="#ff0000"/></svg>',
};

// The language key is shared with Run, Abood! on purpose, so a choice made in one game carries to the other.
const LANG_KEY = 'abood-lang';
const readStored = () => { try { const v = globalThis.localStorage && globalThis.localStorage.getItem(LANG_KEY); return v === 'ar' || v === 'en' ? v : null; } catch (e) { return null; } };
let cur = 'ar';
{ const st = readStored(), s = settings(); cur = st || (s.picked && (s.lang === 'en' || s.lang === 'ar') ? s.lang : 'ar'); }
const listeners = [];

export const lang = () => cur;
export const getLang = lang;
export const dir = () => cur === 'ar' ? 'rtl' : 'ltr';
export const hasPickedLang = () => !!readStored() || !!settings().picked;
export const hasStoredLang = hasPickedLang;
export function onLang(fn) { listeners.push(fn); }

export function T(key, ...args) {
  const v = STR[cur][key] ?? STR.en[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
const lastLine = {};
export function TL(key) {
  const v = STR[cur][key] ?? STR.en[key];
  if (!Array.isArray(v)) return typeof v === 'function' ? v() : (v ?? key);
  if (v.length < 2) return v[0] ?? '';
  let i = Math.floor(Math.random() * v.length);
  if (i === lastLine[key]) i = (i + 1 + Math.floor(Math.random() * (v.length - 1))) % v.length;
  lastLine[key] = i;
  return v[i];
}
export const upText = (id, lv) => T('up_' + id + '_v', upValue(id, lv));

export function applyI18n(root) {
  if (typeof document === 'undefined') return;
  root = root || document;
  const html = document.documentElement;
  if (html) { html.lang = cur; html.dir = dir(); }
  if (root === document) document.title = T('title');
  if (!root.querySelectorAll) return;
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = T(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', T(el.dataset.i18nAria)); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', T(el.dataset.i18nTitle)); });
  root.querySelectorAll('.lang').forEach(g => {
    g.innerHTML = ['ar', 'en'].map(l => `<button type="button" data-lang="${l}" class="${l === cur ? 'on' : ''}" aria-pressed="${l === cur}" aria-label="${l === 'ar' ? 'العربية' : 'English'}">${FLAG[l]}</button>`).join('');
  });
}
export const applyLang = () => applyI18n();

export function setLang(l) {
  if (l !== 'ar' && l !== 'en') return;
  cur = l;
  try { globalThis.localStorage && globalThis.localStorage.setItem(LANG_KEY, l); } catch (e) {}
  setSetting('lang', l); setSetting('picked', true);
  applyI18n();
  listeners.forEach(fn => { try { fn(cur); } catch (e) {} });
  try { if (typeof window !== 'undefined' && window.dispatchEvent) window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: cur } })); } catch (e) {}
}
