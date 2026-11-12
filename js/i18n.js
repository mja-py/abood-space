// Strings for "Abood to the Moon" in Arabic (default, Emirati tone) and English, plus the language switch.
// Safe to import in node: every document / window / localStorage access is guarded.
// Arabic uses Western digits (0-9, %, .) like nf(), so numbers never mix two digit systems (review I1).
//
// ---- exports ----
//   T(key, ...args)    string, or the result of a function-valued string; arrays come back as arrays; unknown key -> key.
//                      While Mozah plays (setGirl(true)) it prefers key + 'G' (her feminine / named version) when it exists.
//   TL(key)            a random line from an array-valued string (robot banter, tips), never the same line twice in a row;
//                      prefers key + 'G' like T()
//   setGirl(b)         Mozah is playing (game.js at boot, ui.js after M.setChar); starts as M.char() === 'mozah'
//   isGirl()           the current flag
//   nf(n)              en-US digits with commas in both languages; nf('+25') keeps the sign
//   sgn(n)             '+n' kept left-to-right inside Arabic text (bidi isolate), plain '+n' in English
//   lang() / getLang() 'ar' | 'en';  dir() 'rtl' | 'ltr'
//   setLang(l)         persists ('abood-lang', shared with Run, Abood! on purpose + the meta save), sets <html lang dir>,
//                      calls applyI18n(), dispatches window 'langchange' (detail: { lang })
//   applyI18n(root = document)  fills [data-i18n] textContent, [data-i18n-aria] aria-label, [data-i18n-title] title,
//                      renders the .lang flag pills (buttons with data-lang) like the old game; also sets document.title
//   applyLang()        = applyI18n(document) (old-game name)
//   onLang(fn)         callback after every language change
//   hasPickedLang() / hasStoredLang()   true once a language was chosen (show the picker otherwise)
//   upText(id, lv)     effect text of upgrade `id` at level `lv` (e.g. "Damage 1.5 · 5 shots/s")
//   FLAG               { ar, en } inline SVG flags;  STR  the raw tables;  KEYS  every key (sorted; ar and en have the same set)
//
// ---- KEYS (both languages have exactly the same set; a `G` key is Mozah's version of the key without the G) ----
// general   title kicker story story_short station n_abood n_nabeeh n_usta coins(n) cur arrow sec
// buttons   b_launch b_hangar b_suits b_costumes b_missions b_duels b_badges b_help b_close b_back b_station b_next b_retry
//           b_resume b_quit b_menu b_ok b_fullscreen b_replay
// menu      m_journeys m_legs m_leg(i) m_legOf(i,n) m_locked m_lockedHint(name) m_done m_new m_replay m_reward(n)
//           m_bonus(n) m_route(a,b) m_best(n) m_legsDone(a,b) m_next(name) m_allDone
// gates     m_need(n,have) m_needShort(n) r_gateNear(n,name) a_shipLv(n)
// bodies    p_earth p_moon p_mars p_venus p_belt p_jupiter p_saturn p_uranus p_neptune
// journeys  j_<id> j_<id>_d   for moon mars venus belt jupiter saturn uranus neptune
// legs      leg_<jid>_0 leg_<jid>_1 leg_<jid>_2
// HUD       h_score h_hull h_super h_superReady h_combo(n) h_shield h_rapid h_prog(a,b) h_rival hint
// a11y      a_pause a_sound a_super a_lang a_coins a_hp(n,m) a_close a_stars(n) a_fps
// floating  f_meteor f_superReady f_repair f_shield f_shieldUp f_shieldPop f_cell f_rapid f_combo(n) f_newBest f_mission
//           f_badge(name) f_halfway f_lowhp f_legDone f_arrive(name) f_unlocked(name) f_coins(n) f_chain
//           f_duel f_enrage f_fixed(name) f_shieldBreak
// results   r_win r_arrive(name) r_fail r_failHint r_score r_best r_newBest r_kills r_picked r_reward r_replay r_bonus
//           r_total r_kept r_meteors r_hits r_noHit r_unlocked(name) r_badges r_missions r_none r_postcard(name)
//           r_factTitle r_tryUpgrade r_coinMult(m) r_levelUp r_girl r_stars r_starPay(n) r_nextStar(n,have) r_dayBonus
// pause     pa_title pa_hint
// help      help_title help_s_controls help_s_space help_s_ship help_s_trips help_story help_move help_fire help_super
//           help_meteor help_hull help_shield help_coins help_pickups help_hangar help_nabeeh help_legs help_keys
//           help_gates help_stars help_duels help_ladder help_boosters help_mozah fps_l(n) fps_note(n)
// rotate    rotate rotate_hint
// loader    ld_fonts ld_art ld_sound ld_cache ld_ready tips[]
// update    update updateBtn
// language  pickTitle pickHint lang_ar lang_en
// misc      ios sound pause fullscreen
// hangar    hg_title hg_note hg_tier(n) hg_tabUp hg_tabBoost up_<id> up_<id>_d up_<id>_v(v)  (ids: blaster spread hull shield
//           super engine magnet nabeeh; v = M.upValue(id, lv), or use upText; ✦ trick text included) up_lv(k,n) up_max
//           up_buy(n) up_next up_now up_rec up_trick(name) tr_<trick> (pierce regen shieldBlast nearMiss pullPickups warn
//           intercept double) bought notEnough shopNote usta_tip(name)
// boosters  bo_title bo_<id> bo_<id>_d (shield super hull coins) bo_have(n) bo_arm bo_none bo_used
// characters ch_abood ch_mozah ch_title ch_pick ch_playing ch_lock(n,g) girlNew
// costumes  cs_title cs_note cs_colors cs_perks cs_skins cs_<id> (every costume) cp_<id> (every perk costume) cs_linkNote
//           cs_src_coins cs_src_badge(name) cs_src_rival(name) cs_src_ladder(n) cs_src_stars(a,b) sk_<id> (every paint) paint
//           v1: st_title st_note suit_<id> perk_heat perk_pilot perk_gold free wear wearing badgeOnly buy(n) owned
// missions  ms_title ms_daily ms_note ms_bonus(n) ms_<kind>(g) (every kind in M.MISSION_KINDS) ms_prog(a,b) ms_done claim claimed
// ladder    ld_title(n) ld_mult(m) ld_note(m,nx,r) ld_skip(n) ld_wait ld_up(lv,m,r) lm_<kind>(g) (every ladder kind)
// stars     st_1 st_2(p) st_3(n)
// duels     du_title du_note du_lock du_lockNext(name) du_fight du_rematch du_par(s) du_diff du_reward(n) du_unlock du_day
//           du_best(s) du_win du_lose du_fixedTitle(name) du_time b_rematch rv_<id> rv_<id>_t rv_<id>_d rv_<id>_taunt[] rv_<id>_fixed rv_sifr_bot
// login     lg_title lg_day(n) lg_claim(n) lg_done lg_streak(n) lg_booster lg_welcome
// badges    bg_title bg_tiered bg_count(a,b) bg_locked bg_reward(n) bg_prog(a,b) tier_0 tier_1 tier_2 tier_none tier_all
//           one-offs bg_<id> bg_<id>_d (first hangar moon mars duel1 saturn tour champion stars24 stars48 stars72 mozah)
//           tiered  bc_<id> bc_<id>_d(g) (rocks meteors coins supers legs planets nohit crystals chains duels ladder loyal)
// robots    bot_start bot_hit bot_meteor bot_super bot_combo bot_lowhp bot_win bot_lose bot_menu bot_arrive bot_shield
//           bot_pickup bot_duel bot_duelWin bot_duelLose bot_welcome usta_lines usta_buy usta_poor usta_max   (arrays: use TL)
// facts     fact_earth fact_moon fact_mars fact_venus fact_belt fact_jupiter fact_saturn fact_uranus fact_neptune
import { upValue, settings, setSetting, char } from './meta.js?v=__BUILD__';

export const nf = n => (typeof n === 'string' && n[0] === '+') ? '+' + nf(n.slice(1)) : Number(n).toLocaleString('en-US');
const pct = v => Math.round(v * 100);
const iso = s => '⁦' + s + '⁩';                 // left-to-right isolate inside Arabic text
const pl = n => iso('+' + nf(n));                          // "+25" that stays "+25" in RTL
const xm = m => iso('×' + nf(m));                          // "×1.5"
export const sgn = n => cur === 'ar' ? pl(n) : '+' + nf(n);
const pctOf = p => nf(p > 1 ? Math.round(p) : pct(p));   // 60 or 0.6 -> "60"

// mission texts: [Arabic for Abood, Arabic for Mozah, English] per kind (daily ms_ and ladder lm_ use the same words)
const MS = {
  rocks: [g => `كسّر ${nf(g)} صخرة وخردة`, g => `كسّري ${nf(g)} صخرة وخردة`, g => `Destroy ${nf(g)} rocks and junk`],
  runKills: [g => `كسّر ${nf(g)} شي في رحلة وحدة`, g => `كسّري ${nf(g)} شي في رحلة وحدة`, g => `Destroy ${nf(g)} things in one flight`],
  runRocks: [g => `كسّر ${nf(g)} شي في مرحلة وحدة`, g => `كسّري ${nf(g)} شي في مرحلة وحدة`, g => `Destroy ${nf(g)} things in one leg`],
  crystals: [g => `كسّر ${nf(g)} صخرة كريستال`, g => `كسّري ${nf(g)} صخرة كريستال`, g => `Smash ${nf(g)} crystal rocks`],
  chain: [g => `كسّر ${nf(g)} شي بانفجار خزانات الوقود`, g => `كسّري ${nf(g)} شي بانفجار خزانات الوقود`, g => `Destroy ${nf(g)} things with fuel-tank blasts`],
  meteors: [g => `افلت من ${nf(g)} نيازك`, g => `افلتي من ${nf(g)} نيازك`, g => `Dodge ${nf(g)} meteors`],
  supers: [g => `استخدم شعاع الأمل ${nf(g)} مرات`, g => `استخدمي شعاع الأمل ${nf(g)} مرات`, g => `Use the Amal Beam ${nf(g)} times`],
  beamKills: [g => `كسّر ${nf(g)} شي بشعاع واحد`, g => `كسّري ${nf(g)} شي بشعاع واحد`, g => `Destroy ${nf(g)} things with one beam`],
  coins: [g => `اجمع ${nf(g)} د.إ`, g => `اجمعي ${nf(g)} د.إ`, g => `Pick up AED ${nf(g)}`],
  runCoins: [g => `اجمع ${nf(g)} د.إ في رحلة وحدة`, g => `اجمعي ${nf(g)} د.إ في رحلة وحدة`, g => `Pick up AED ${nf(g)} in one flight`],
  noHit: [g => g > 1 ? `خلّص ${nf(g)} مراحل بدون ولا صدمة` : 'خلّص مرحلة بدون ولا صدمة', g => g > 1 ? `خلّصي ${nf(g)} مراحل بدون ولا صدمة` : 'خلّصي مرحلة بدون ولا صدمة',
    g => g > 1 ? `Finish ${nf(g)} legs without a single hit` : 'Finish a leg without a single hit'],
  fullHull: [g => g > 1 ? `خلّص ${nf(g)} مراحل والهيكل فل` : 'خلّص مرحلة والهيكل فل', g => g > 1 ? `خلّصي ${nf(g)} مراحل والهيكل فل` : 'خلّصي مرحلة والهيكل فل',
    g => g > 1 ? `Finish ${nf(g)} legs with a full hull` : 'Finish a leg with a full hull'],
  combo: [g => `سوّ كومبو ${nf(g)} في رحلة وحدة`, g => `سوّي كومبو ${nf(g)} في رحلة وحدة`, g => `Make a ${nf(g)}-hit combo in one flight`],
  legs: [g => g > 1 ? `خلّص ${nf(g)} مراحل` : 'خلّص مرحلة وحدة', g => g > 1 ? `خلّصي ${nf(g)} مراحل` : 'خلّصي مرحلة وحدة', g => g > 1 ? `Finish ${nf(g)} legs` : 'Finish a leg'],
  planet: [g => g > 1 ? `وصّل كوكب ${nf(g)} مرات` : 'وصّل كوكب (خلّص مرحلة ثالثة)', g => g > 1 ? `وصّلي كوكب ${nf(g)} مرات` : 'وصّلي كوكب (خلّصي مرحلة ثالثة)',
    g => g > 1 ? `Reach a planet ${nf(g)} times` : 'Reach a planet (finish a 3rd leg)'],
  pickups: [g => `اجمع ${nf(g)} قوى (تصليح، درع، طاقة، رمي سريع)`, g => `اجمعي ${nf(g)} قوى (تصليح، درع، طاقة، رمي سريع)`, g => `Collect ${nf(g)} power-ups`],
  botKills: [g => `خلّ نبيه يكسّر ${nf(g)} شي بالليزر`, g => `خلّي نبيه يكسّر ${nf(g)} شي بالليزر`, g => `Let Nabeeh's laser destroy ${nf(g)} things`],
  duelWin: [g => g > 1 ? `صلّح ${nf(g)} روبوتات في التحدي` : 'صلّح روبوت في التحدي', g => g > 1 ? `صلّحي ${nf(g)} روبوتات في التحدي` : 'صلّحي روبوت في التحدي',
    g => g > 1 ? `Win ${nf(g)} duels` : 'Win a duel'],
};

// Arabic is the default language; English is one tap away on the flag button.
export const STR = {
  ar: {
    // ---- general ----
    title: 'عبود إلى القمر',
    kicker: 'نبيه جاهز، والسفينة جاهزة… وانت؟', kickerG: 'نبيه جاهز، والسفينة جاهزة… وانتي؟',
    story: 'عبود كبر وصار أصغر رائد فضاء في محطة فلك، فوق الأرض، وساكن هناك مع روبوته الذكي نبيه. حلمه من وهو صغير: يطير للقمر، وبعدين لكل كواكب المجموعة الشمسية! الأسطى يجهّز السفينة، ونبيه يحسب الطريق… والصخور والخردة والنيازك تنتظرهم.',
    storyG: 'موزة، أخت عبود، خلّصت تدريبها وانضمّت لمحطة فلك! تطير بنفس سفينة العائلة مع نبيه، والأسطى يجهّزها لها. حلمها: تلف كل كواكب المجموعة الشمسية… وتصلّح كل روبوت متمرد تلاقيه في الطريق!',
    story_short: 'من محطة فلك للقمر… وبعدين لكل الكواكب!',
    station: 'محطة فلك', n_abood: 'عبود', n_aboodG: 'موزة', n_nabeeh: 'نبيه', n_usta: 'الأسطى',
    coins: n => `${nf(n)} د.إ`, cur: 'د.إ', arrow: '←', sec: ' ث',
    // ---- buttons ----
    b_launch: 'انطلق!', b_launchG: 'انطلقي!', b_hangar: 'ورشة الأسطى', b_suits: 'البدلات', b_costumes: 'البدلات', b_missions: 'المهمات', b_duels: 'التحدي',
    b_badges: 'الأوسمة', b_help: 'طريقة اللعب', b_close: 'إغلاق', b_back: 'رجوع', b_station: 'المحطة', b_next: 'المرحلة الياية',
    b_retry: 'حاول مرة ثانية', b_retryG: 'حاولي مرة ثانية', b_resume: 'كمّل', b_resumeG: 'كمّلي',
    b_quit: 'ارجع للمحطة', b_quitG: 'ارجعي للمحطة', b_menu: 'القائمة', b_ok: 'تمام', b_fullscreen: 'ملء الشاشة', b_replay: 'عيدها', b_replayG: 'عيديها',
    // ---- menu ----
    m_journeys: 'رحلاتك', m_legs: 'المراحل', m_leg: i => `المرحلة ${nf(i + 1)}`, m_legOf: (i, n) => `المرحلة ${nf(i + 1)} من ${nf(n)}`,
    m_locked: 'مقفلة', m_lockedHint: name => `وصّل ${name} أول عشان تنفتح`, m_lockedHintG: name => `وصّلي ${name} أول عشان تنفتح`,
    m_done: 'خلصت ✓', m_new: 'جديد!',
    m_replay: 'إعادة · 35% من المكافأة', m_reward: n => `المكافأة ${nf(n)} د.إ`, m_bonus: n => `مكافأة الوصول ${nf(n)} د.إ`,
    m_route: (a, b) => `${a} ← ${b}`, m_best: n => `أفضل نتيجة: ${nf(n)}`, m_legsDone: (a, b) => `${nf(a)} من ${nf(b)}`,
    m_next: name => `الجاي: ${name}`, m_allDone: 'لفّيت المجموعة الشمسية كلها! عيد أي مرحلة وجمّع دراهم.',
    m_allDoneG: 'لفّيتي المجموعة الشمسية كلها! عيدي أي مرحلة وجمّعي دراهم.',
    // ---- gates (ship level) ----
    m_need: (n, have) => `الأسطى: نحتاج مستوى السفينة ${nf(n)}، وعندك ${nf(have)}. طوّر السفينة في الورشة!`,
    m_needG: (n, have) => `الأسطى: نحتاج مستوى السفينة ${nf(n)}، وعندج ${nf(have)}. طوّري السفينة في الورشة!`,
    m_needShort: n => `مستوى ${nf(n)}`,
    r_gateNear: (n, name) => n > 1 ? `باقي ${nf(n)} تطويرات وتنفتح رحلة ${name}` : `باقي تطوير واحد وتنفتح رحلة ${name}`,
    r_gateNearG: (n, name) => n > 1 ? `باقي لج ${nf(n)} تطويرات وتنفتح رحلة ${name}` : `باقي لج تطوير واحد وتنفتح رحلة ${name}`,
    a_shipLv: n => `مستوى السفينة ${nf(n)}`,
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
    h_shield: 'الدرع', h_rapid: 'رمي سريع', h_prog: (a, b) => `${a} ← ${b}`, h_rival: 'الروبوت المتمرد',
    hint: 'اسحب إصبعك فوق وتحت عشان تحرّك السفينة. المدفع يرمي بروحه!',
    hintG: 'اسحبي إصبعج فوق وتحت عشان تحرّكين السفينة. المدفع يرمي بروحه!',
    // ---- a11y ----
    a_pause: 'إيقاف مؤقت', a_sound: 'الصوت والموسيقى', a_super: 'شعاع الأمل', a_lang: 'اللغة', a_coins: 'دراهمك', a_coinsG: 'دراهمج',
    a_hp: (n, m) => `الهيكل ${nf(n)} من ${nf(m)}`, a_close: 'إغلاق', a_stars: n => `${nf(n)} من 3 نجوم`,
    // ---- floating text ----
    f_meteor: 'نيزك!', f_superReady: 'شعاع الأمل جاهز!', f_repair: '+1 هيكل', f_shield: 'درع!', f_shieldUp: 'الدرع رجع',
    f_shieldPop: 'الدرع حماك!', f_shieldPopG: 'الدرع حماج!', f_cell: '+35% شحنة', f_rapid: 'رمي سريع!', f_combo: n => `كومبو ×${n}`, f_newBest: 'رقم قياسي جديد!',
    f_mission: 'خلّصت مهمة!', f_missionG: 'خلّصتي مهمة!', f_badge: name => `وسام جديد: ${name}`, f_halfway: 'نص الطريق!', f_lowhp: 'الهيكل تعبان!',
    f_legDone: 'المرحلة خلصت!', f_arrive: name => `وصلنا ${name}!`, f_unlocked: name => `انفتحت رحلة ${name}!`, f_coins: n => `${nf(n)} د.إ`,
    f_chain: 'انفجار متسلسل!', f_duel: 'تحدي!', f_enrage: 'الروبوت عصّب! صار أسرع!', f_fixed: name => `${name} تصلّح!`, f_shieldBreak: 'الدرع انكسر!',
    // v3
    f_warning: 'تحذير!', f_bump: 'طق!', f_respawn: 'رجعنا!', f_hard: 'المستوى الصعب', f_rescued: 'أنقذنا روبوت!', f_freed: 'نبيه رجع!', f_grabbed: 'خطفوا نبيه!',
    f_flare: 'انفجار شمسي! تخبّى ورا صخرة!', f_flareG: 'انفجار شمسي! تخبّي ورا صخرة!', f_cascade: 'انهيار صخور!', f_scrapRain: 'مطر خردة! كله دراهم!',
    f_corridor: 'محطة مهجورة! عدّل الطريق!', f_corridorG: 'محطة مهجورة! عدّلي الطريق!', f_turret: 'برج حراسة! انتبه من طلقاته!', f_turretG: 'برج حراسة! انتبهي من طلقاته!',
    r_bossReward: 'جائزة الروبوت', r_bossFixed: name => `${name} تصلّح وصار صديق!`, r_medalPay: n => `ميداليات جديدة ${pl(n)} د.إ`, r_medals: 'الميداليات',
    r_rescued: (a, b) => `أنقذت ${nf(a)} من ${nf(b)} روبوتات`, r_rescuedG: (a, b) => `أنقذتي ${nf(a)} من ${nf(b)} روبوتات`,
    md_finish: 'خلّص المرحلة', md_finishG: 'خلّصي المرحلة', md_noDamage: 'بدون أي صدمة', md_rescue: 'أنقذ كل الروبوتات', md_rescueG: 'أنقذي كل الروبوتات', md_score: n => `${nf(n)} نقطة`,
    md_hard: 'كل الميداليات! انفتح المستوى الصعب لهالرحلة.', b_hard: 'صعب', b_hardOff: 'عادي', hd_note: 'المستوى الصعب: أسرع وأقوى، والمكافأة ×2.',
    // ---- results ----
    r_win: 'المرحلة خلصت!', r_arrive: name => `وصلت ${name}!`, r_arriveG: name => `وصلتي ${name}!`, r_fail: 'المهمة فشلت',
    r_failHint: 'الدراهم اللي جمعتها لك، والمكافأة تنتظرك المرة الياية.', r_failHintG: 'الدراهم اللي جمعتيها لج، والمكافأة تنتظرج المرة الياية.',
    r_score: 'النقاط', r_best: 'الأفضل', r_newBest: 'رقم قياسي جديد!', r_kills: 'كسّرت', r_killsG: 'كسّرتي',
    r_picked: 'دراهم جمعتها', r_pickedG: 'دراهم جمعتيها', r_reward: 'مكافأة المرحلة', r_duelReward: 'جايزة التحدي',
    r_replay: 'مكافأة الإعادة (35%)', r_bonus: 'مكافأة الوصول', r_total: 'المجموع', r_kept: 'دراهم جمعتها', r_keptG: 'دراهم جمعتيها',
    r_meteors: 'نيازك فلت منها', r_meteorsG: 'نيازك فلتّي منها',
    r_hits: 'صدمات', r_noHit: 'بدون ولا صدمة!', r_unlocked: name => `انفتحت رحلة جديدة: ${name}`, r_badges: 'أوسمة جديدة',
    r_missions: 'مهمات خلصتها', r_missionsG: 'مهمات خلصتيها',
    r_none: 'ما في شي جديد هالمرة.', r_postcard: name => `بطاقة من ${name}`, r_factTitle: 'تدري؟',
    r_tryUpgrade: 'جرّب تطوّر السفينة عند الأسطى!', r_tryUpgradeG: 'جرّبي تطوّرين السفينة عند الأسطى!',
    r_coinMult: m => `مضاعف الدراهم ${xm(m ?? 1)}`, r_levelUp: 'سلّم المهمات: مستوى جديد!', r_girl: 'موزة انضمّت لمحطة فلك!',
    r_stars: 'النجوم', r_starPay: n => `نجوم جديدة ${pl(n)} د.إ`,
    r_nextStar: (n, have) => `النجمة الثالثة: ${nf(n)} نقطة، وانت جبت ${nf(have)}`, r_nextStarG: (n, have) => `النجمة الثالثة: ${nf(n)} نقطة، وانتي جبتي ${nf(have)}`,
    r_dayBonus: 'مكافأة تحدي اليوم ×2',
    // ---- pause ----
    pa_title: 'إيقاف مؤقت', pa_hint: 'اضغط «كمّل» أو P عشان ترجع للطيران', pa_hintG: 'اضغطي «كمّلي» أو P عشان ترجعين للطيران',
    // ---- help ----
    a_fps: 'سرعة الإطارات', fps_l: n => n === 30 ? 'توفير البطارية: 30 إطار' : 'لعب سلس: 60 إطار', fps_note: n => n === 30 ? 'توفير البطارية: 30 إطار، والتلفون يبرد أكثر' : 'لعب سلس: 60 إطار',
    help_title: 'طريقة اللعب', help_s_controls: 'التحكم', help_s_space: 'في الفضاء', help_s_ship: 'سفينتك', help_s_trips: 'الرحلات',
    help_story: 'كل رحلة لكوكب فيها 3 مراحل. خلّص المرحلة الثالثة وتوصل الكوكب وتنفتح الرحلة الياية.',
    help_storyG: 'كل رحلة لكوكب فيها 3 مراحل. خلّصي المرحلة الثالثة وتوصلين الكوكب وتنفتح الرحلة الياية.',
    help_move: 'اسحب إصبعك في أي مكان: السفينة تطير فوق وتحت وقدّام وورا في الجزء اليسار من الشاشة. على الكمبيوتر: الأسهم أو W A S D.',
    help_moveG: 'اسحبي إصبعج في أي مكان: السفينة تطير فوق وتحت وقدّام وورا في الجزء اليسار من الشاشة. على الكمبيوتر: الأسهم أو W A S D.',
    // v3.1
    f_graze: 'لمسة!', f_rage: 'عصّب!', f_wingJoin: 'مرافق جديد!', f_wingSave: 'حماك!', f_wingSaveG: 'حماج!', f_partDown: 'قطعة طاحت!', f_coreOpen: 'القلب مكشوف!', f_advance: 'الروبوت يقرّب!', f_desp: 'آخر محاولة!',
    bh_clam: 'بابه الحديدي مسكّر! انتظر لين ينفتح واضرب!', bh_clamG: 'بابه الحديدي مسكّر! انتظري لين ينفتح واضربي!',
    bh_bubble: 'كل فقاعة تنقسم لثنتين! فجّر الصغار وخذ الدراهم.', bh_bubbleG: 'كل فقاعة تنقسم لثنتين! فجّري الصغار وخذي الدراهم.',
    bh_hornet: 'شوف الخط المنقّط؟ هذا طريق الزنبور. ابعد عنه!', bh_hornetG: 'شوفي الخط المنقّط؟ هذا طريق الزنبور. ابعدي عنه!',
    bh_magnet: 'المغناطيس يلبس الخردة درع. كسّرها قبل ما يرميها!', bh_magnetG: 'المغناطيس يلبس الخردة درع. كسّريها قبل ما يرميها!',
    bh_search: 'لا تخلّي الضو يلقطك! تخبّى ورا الصخور، وبعدين اطلع واضرب.', bh_searchG: 'لا تخلّين الضو يلقطج! تخبّي ورا الصخور، وبعدين اطلعي واضربي.',
    bh_hide: 'لعبة غمّيضة! دوّر على اللي عينه تلمع.', bh_hideG: 'لعبة غمّيضة! دوّري على اللي عينه تلمع.',
    bh_vortex: 'الدرع يدور! اضرب من الفتحة.', bh_vortexG: 'الدرع يدور! اضربي من الفتحة.',
    bh_builder: 'ملك الخردة يبني جدار! افتح فتحة ووصل للقلب.', bh_builderG: 'ملك الخردة يبني جدار! افتحي فتحة ووصلي للقلب.',
    bh_hammer: 'المطرقة بتطيح في العمود الأحمر! بعدها اضرب المفصل الأصفر.', bh_hammerG: 'المطرقة بتطيح في العمود الأحمر! بعدها اضربي المفصل الأصفر.',
    bc_boss: 'زعيم', bc_guard: 'حارس', bc_s1: 'صغير العائلة', bc_s2: 'كبر وتقوّى', bc_s3: 'الزعيم',
    bc_q_khurda: 'الخردة العملاقة', bc_q_bubolt: 'سفينة القراصنة', bc_q_zannana: 'ملكة الخلية', bc_q_magna: 'المغناطيس العملاق', bc_q_radar: 'الرادار العملاق',
    bc_q_ghummaid: 'قمر المرايا', bc_q_dawwama: 'الإعصار العملاق', bc_q_sifr: 'صفر الأعظم',
    bq_brood: ['يلا يا صغاري!', 'اطلعوا له!'], bq_broodG: ['يلا يا صغاري!', 'اطلعوا لها!'], bq_royal: ['الحين تشوف قوتي!', 'ما في مكان آمن!'], bq_royalG: ['الحين تشوفين قوتي!', 'ما في مكان آمن!'],
    bot_family: ['كلهم عائلة وحدة! الصغار أول، وبعدين الكبير!', 'هذي عائلة روبوتات. الأكبر ينتظرنا في الآخر!'], bot_giant: ['عملاق! هذا أكبر واحد في العائلة!', 'يا ساتر! كبير وايد! ركّز على حيلته!'], bot_giantG: ['عملاق! هذا أكبر واحد في العائلة!', 'يا ساتر! كبير وايد! ركّزي على حيلته!'], f_decoy: 'مو هذا!', f_found: 'لقيتك!', f_supply: 'طرد إمداد!', f_wpUp: 'تطوّر!',
    bot_found: ['أحسنت! لقيته!', 'عيونك قوية!'], bot_foundG: ['أحسنتي! لقيتيه!', 'عيونج قوية!'],
    // v3.4: the boss brain speaks (bq_*), and Nabeeh's tips about it
    bq_camp: ['دايم تتخبّى هناك!', 'نفس المكان؟ سهل!'], bq_campG: ['دايم تتخبّين هناك!', 'نفس المكان؟ سهل!'],
    bq_ouch: ['آي! شغّلوا الدروع!', 'هيه! هذي عوّرتني!'], bq_hit: ['صدتك!', 'ها! بطيء!'], bq_hitG: ['صدتج!', 'ها! بطيئة!'],
    bq_learn: 'هذي نفعت معاك آخر مرة!', bq_learnG: 'هذي نفعت معاج آخر مرة!', bq_again: 'انت مرة ثانية؟ حافظ حركاتك!', bq_againG: 'انتي مرة ثانية؟ حافظ حركاتج!',
    bq_study: 'درست كل معاركك. أعرف وين تغلط!', bq_studyG: 'درست كل معاركج. أعرف وين تغلطين!',
    bq_feint: ['خدعتك!', 'غيّرت رايي!'], bq_feintG: ['خدعتج!', 'غيّرت رايي!'], bq_lost: ['هاه؟ وين رحت؟', 'كان هني قبل شوي…'], bq_lostG: ['هاه؟ وين رحتي؟', 'كانت هني قبل شوي…'],
    bq_see: ['شفتك!', 'لقيتك!'], bq_seeG: ['شفتج!', 'لقيتج!'], bq_dodge: ['ما صبتني!', 'أنا أسرع!'], bq_dodgeG: ['ما صبتيني!', 'أنا أسرع!'],
    bq_scared: 'ابعد عني! ابعد!', bq_scaredG: 'ابعدي عني! ابعدي!', bq_toy: 'سلاح جديد؟ شوف هذي!', bq_toyG: 'سلاح جديد؟ شوفي هذي!',
    bq_knock: 'لا تدق على القوقعة!', bq_knockG: 'لا تدقين على القوقعة!', bq_tickle: 'ههههه! تدغدغني!', bq_tickleG: 'ههههه! تدغدغيني!',
    bq_flush: ['اطلع من هناك!', 'ما في مخبى!'], bq_flushG: ['اطلعي من هناك!', 'ما في مخبى!'], bq_seal: 'سدّوا الفتحة!',
    bq_read: 'دايم تهرب من هالصوب!', bq_readG: 'دايم تهربين من هالصوب!', bq_lucky: 'حظ! الحين أسرع!', bq_suck: 'تعالوا يا فقاعاتي!',
    bq_pull: 'تعال قريب!', bq_pullG: 'تعالي قريب!',
    bot_brain: 'انتبه! هالروبوت يراقب حركاتك. لا تقعد في مكان واحد!', bot_brainG: 'انتبهي! هالروبوت يراقب حركاتج. لا تقعدين في مكان واحد!',
    bot_nerv: 'صوّب على كل صندوق: الحقيقي يرتبك ويعرق!', bot_nervG: 'صوّبي على كل صندوق: الحقيقي يرتبك ويعرق!',
    bot_orb: ['الكور الرمادية تقدر تضربها!', 'الرمادي ينكسر، والوردي ابعد عنه!'], bot_orbG: ['الكور الرمادية تقدرين تضربينها!', 'الرمادي ينكسر، والوردي ابعدي عنه!'],
    bot_carrier: ['شوف الطيارة الصغيرة؟ اضربها وتطيح هدية!', 'طيارة إمداد! افتحها بالضرب!'], bot_carrierG: ['شوفي الطيارة الصغيرة؟ اضربيها وتطيح هدية!', 'طيارة إمداد! افتحيها بالضرب!'],
    bot_capsule: ['الكبسولة تغيّر لونها. خذها لما يطلع السلاح اللي تبيه!', 'نفس السلاح مرة ثانية يصير أقوى!'], bot_capsuleG: ['الكبسولة تغيّر لونها. خذيها لما يطلع السلاح اللي تبينه!', 'نفس السلاح مرة ثانية يصير أقوى!'],
    mod_title: 'طقس الفضا', mod_ion: 'عاصفة أيونات: الطلقات أبطأ والصخور أسرع', mod_dark: 'منطقة مظلمة: ما تشوف إلا اللي قريب', mod_magnet: 'حقل مغناطيسي: يسحب السفينة فوق وتحت', mod_wind: 'رياح شمسية: كل شي ينجرف',
    wp_spread: 'مروحة', wp_laser: 'ليزر', wp_homing: 'صواريخ ذكية', wp_saw: 'مناشير', h_wings: 'المرافقين', h_parts: 'قطع الروبوت الكبير',
    rq_tap: 'اضغط للتالي', rq_tapG: 'اضغطي للتالي', rq_skip: 'تخطّي', rq_later: 'بعدين', rq_pick: 'اختار', rq_pickG: 'اختاري', rq_of: (a, b) => `${nf(a)} من ${nf(b)}`,
    rq_level: 'ترقية!', rq_unlock: 'رحلة جديدة', rq_hard: 'المستوى الصعب', rq_badge: 'وسام جديد', rq_mission: 'مهمة خلصت', rq_new: 'شي جديد لك', rq_girl: 'صديقة جديدة', rq_newSkin: 'طلاء جديد للسفينة', rq_newSuit: 'بدلة جديدة',
    cs_step1: 'الرائد', cs_step2: 'البدلة', cs_step3: 'السفينة', cs_free: 'ألوان', cs_special: 'بدلات خاصة', cs_pickHint: 'اختار من تحت وشوف الشكل هنا', cs_pickHintG: 'اختاري من تحت وشوفي الشكل هنا',
    cs_next: 'التالي', cs_done: 'تمام', cs_nowWearing: 'لابسها الحين', cs_nowWearingG: 'لابستها الحين', cs_nowShip: 'سفينتك الحين',
    rb_shot: 'روبوت رامي!', rb_dash: 'روبوت هجّام!', rb_bomb: 'روبوت قنابل!', rb_sweep: 'روبوت ليزر!', rb_shield: 'روبوت دروع!', rb_swarm: 'روبوت سرب!',
    help_robots: 'من الزهرة تطلع الروبوتات الغاضبة. كل رحلة تعلّمك حركة جديدة: طلقة، هجمة، قنبلة، ليزر، درع، وسرب. لما تعصّب تصير حمرا وأسرع.',
    help_robotsG: 'من الزهرة تطلع الروبوتات الغاضبة. كل رحلة تعلّمج حركة جديدة: طلقة، هجمة، قنبلة، ليزر، درع، وسرب. لما تعصّب تصير حمرا وأسرع.',
    help_wings: 'كل روبوت تنقذه يصير مرافق يطير جنبك ويرمي، ويصدّ عنك صدمة وحدة.', help_wingsG: 'كل روبوت تنقذينه يصير مرافق يطير جنبج ويرمي، ويصدّ عنج صدمة وحدة.',
    help_weapons: 'اضرب طيارة الإمداد وتطيح كبسولة تغيّر لونها: مروحة، ليزر، صواريخ ذكية، أو مناشير. نفس السلاح مرة ثانية يصير أقوى (لين 3 نقاط)، والضربة تنزّله نقطة. الطلقات الرمادية تنكسر، والوردية ابعد عنها.',
    help_graze: 'الطلقة اللي تعدّي قريب منك بدون ما تلمسك تشحن شعاع الأمل. الشجاعة لها جائزة!', help_grazeG: 'الطلقة اللي تعدّي قريب منج بدون ما تلمسج تشحن شعاع الأمل. الشجاعة لها جائزة!',
    help_bigboss: 'كل زعيم له حيلة: قوقعة تنفتح، فقاعات تنقسم، زنبور يطير في دائرة، مغناطيس يلبس الخردة، كشّاف يدوّر عليك، غمّيضة، درع يدور، جدار خردة، ومطرقة. الحارسين قبله يعلّمونك الحيلة، ونبيه يقولها لك في البداية. الزعماء يراقبونك: لو قعدت في مكان واحد يصوّبون عليه، ولو ضربتهم بقوة يحمون نفسهم، ويتذكرون شنو صادك آخر مرة. كل رحلة فيها عائلة روبوتات وحدة: الصغار يطيرون في الطريق، وصغير العائلة في آخر المرحلة الأولى، والكبير في الثانية، والعملاق ينتظر في الآخر. العملاق يطلّع صغاره ويفجّر مناطق.',
    help_mods: 'من المشتري، بعض المراحل فيها طقس فضا: عاصفة أيونات، ظلام، مغناطيس، أو رياح.',
    bot_teach_shot: ['انتبه! هذا الروبوت يرمي على مكانك. تحرّك!', 'شوف الضو في مدفعه؟ يعني بيرمي!'], bot_teach_shotG: ['انتبهي! هذا الروبوت يرمي على مكانج. تحرّكي!', 'شوفي الضو في مدفعه؟ يعني بيرمي!'],
    bot_teach_dash: ['السهم البرتقالي يعني بيهجم في هالخط. اطلع منه!'], bot_teach_dashG: ['السهم البرتقالي يعني بيهجم في هالخط. اطلعي منه!'],
    bot_teach_bomb: ['الدايرة الحمرا مكان القنبلة! اطلع منها قبل ما تنفجر!'], bot_teach_bombG: ['الدايرة الحمرا مكان القنبلة! اطلعي منها قبل ما تنفجر!'],
    bot_teach_sweep: ['الليزر بيمسح من الخط الأول للثاني. عدّ من الجهة الثانية!'], bot_teach_sweepG: ['الليزر بيمسح من الخط الأول للثاني. عدّي من الجهة الثانية!'],
    bot_teach_shield: ['الروبوت الأزرق يحمي ربعه. اضربه هو أول!'], bot_teach_shieldG: ['الروبوت الأزرق يحمي ربعه. اضربيه هو أول!'],
    bot_teach_swarm: ['يطلع درونات صغيرة تلحقك! كسّرها أو ابعد عنها!'], bot_teach_swarmG: ['يطلع درونات صغيرة تلحقج! كسّريها أو ابعدي عنها!'],
    bot_rage: ['عصّب! صار أحمر وأسرع!', 'انتبه، هذا معصّب!'], bot_rageG: ['عصّب! صار أحمر وأسرع!', 'انتبهي، هذا معصّب!'],
    bot_robots: ['روبوتات غاضبة جاية!', 'سرب روبوتات! ركّز!'], bot_robotsG: ['روبوتات غاضبة جاية!', 'سرب روبوتات! ركّزي!'],
    bot_wing: ['المرافق حماك! شكرًا يا صاحبي!', 'راح المرافق… بس أنقذك!'], bot_wingG: ['المرافق حماج! شكرًا يا صاحبي!', 'راح المرافق… بس أنقذج!'],
    bot_weapon: ['سلاح جديد! استغله بسرعة!', 'هذا السلاح لوقت قصير، يلا!'],
    bot_partDown: ['كسرنا قطعة! كمّل!', 'قطعة ثانية وبيضعف!'],
    bot_coreOpen: ['المولّد طاح! القلب مكشوف، اضرب الحين!'], bot_coreOpenG: ['المولّد طاح! القلب مكشوف، اضربي الحين!'],
    bot_desp: ['آخر محاولة منه! اصمد!'], bot_despG: ['آخر محاولة منه! اصمدي!'],
    help_fire: 'المدفع يرمي بروحه طول الوقت. كسّر الصخور والخردة واجمع النقاط.',
    help_fireG: 'المدفع يرمي بروحه طول الوقت. كسّري الصخور والخردة واجمعي النقاط.',
    help_super: 'لما تتعبى الدائرة، اضغط زر شعاع الأمل (أو مسافة / X): شعاع كبير يكسّر كل شي قدامك.',
    help_superG: 'لما تتعبى الدائرة، اضغطي زر شعاع الأمل (أو مسافة / X): شعاع كبير يكسّر كل شي قدامج.',
    help_meteor: 'خط أحمر و«!» يعني نيزك جاي! ما ينكسر إلا بشعاع الأمل، فابعد عن الخط.',
    help_meteorG: 'خط أحمر و«!» يعني نيزك جاي! ما ينكسر إلا بشعاع الأمل، فابعدي عن الخط.',
    help_hull: 'كل صدمة تنقّص الهيكل نقطة، والنيزك نقطتين. لو خلص الهيكل تفشل المهمة، بس الدراهم اللي جمعتها لك.',
    help_hullG: 'كل صدمة تنقّص الهيكل نقطة، والنيزك نقطتين. لو خلص الهيكل تفشل المهمة، بس الدراهم اللي جمعتيها لج.',
    help_shield: 'الدرع (من الأسطى) يصدّ صدمة وحدة ويرجع يتشحن بروحه.',
    help_coins: 'الصخور تطيّح دراهم، والصخور الكريستال تطيّح وايد. خزّان الوقود ينفجر ويكسّر اللي حواليه!',
    help_pickups: 'دوّر على: علبة التصليح (+1 هيكل)، خلية الدرع، خلية الطاقة (+35% شعاع)، والرمي السريع.',
    help_pickupsG: 'دوّري على: علبة التصليح (+1 هيكل)، خلية الدرع، خلية الطاقة (+35% شعاع)، والرمي السريع.',
    help_hangar: 'الأسطى في الورشة يطوّر المدفع والهيكل والدرع والمحرك والمغناطيس ونبيه. السفينة تكبر وتحلو كل ما طوّرتها.',
    help_hangarG: 'الأسطى في الورشة يطوّر المدفع والهيكل والدرع والمحرك والمغناطيس ونبيه. السفينة تكبر وتحلو كل ما طوّرتيها.',
    help_nabeeh: 'نبيه يطير جنبك وينبّهك من النيازك. طوّره ويصير يرمي ليزر، ويشفط الدراهم بعد.',
    help_nabeehG: 'نبيه يطير جنبج وينبّهج من النيازك. طوّريه ويصير يرمي ليزر، ويشفط الدراهم بعد.',
    help_legs: 'تقدر تعيد أي مرحلة خلصتها عشان تجمع دراهم (المكافأة 35%).',
    help_legsG: 'تقدرين تعيدين أي مرحلة خلصتيها عشان تجمعين دراهم (المكافأة 35%).',
    help_keys: 'P أو Esc: إيقاف مؤقت · M: الصوت',
    help_gates: 'من الزهرة وطالع، كل رحلة تحتاج مستوى سفينة معيّن. مستوى السفينة = مجموع مستويات التطوير عند الأسطى.',
    help_stars: 'كل مرحلة فيها 3 نجوم: خلّصها، خلّصها والهيكل 60% أو أكثر، وجيب نقاط النجمة الثالثة. النجوم الجديدة تعطيك دراهم.',
    help_starsG: 'كل مرحلة فيها 3 نجوم: خلّصيها، خلّصيها والهيكل 60% أو أكثر، وجيبي نقاط النجمة الثالثة. النجوم الجديدة تعطيج دراهم.',
    help_duels: 'بعد ما توصل المريخ ينفتح التحدي: روبوتات متمردة من خردة الفضا. طيّح طاقة الروبوت ونبيه يعيد برمجته ويصير صديق!',
    help_duelsG: 'السفن المتمردة تقابلينها في نهاية كل رحلة، وبعد المريخ تنفتح ساحة التحدي: عيدي أي معركة مجانًا، ومرة في اليوم الجائزة ×2.',
    help_easy: 'القمر للصغار: ما في ضرر، الصدمة بس «طق!». المريخ يصلّح نفسه ويرجّعك لو طاحت السفينة. من الزهرة الهيكل حقيقي.',
    help_easyG: 'القمر للصغار: ما في ضرر، الصدمة بس «طق!». المريخ يصلّح نفسه ويرجّعج لو طاحت السفينة. من الزهرة الهيكل حقيقي.',
    help_bosses: 'كل مرحلة تنتهي بروبوت: حارس صغير في المرحلتين الأولى والثانية، والسفينة المتمردة في الثالثة. لما يطلع «تحذير!» جهّز الشعاع!',
    help_bossesG: 'كل مرحلة تنتهي بروبوت: حارس صغير في المرحلتين الأولى والثانية، والسفينة المتمردة في الثالثة. لما يطلع «تحذير!» جهّزي الشعاع!',
    help_rescue: 'كبسولات الإنقاذ: روبوتات صيانة ضايعة. طر فوقها عشان تاخذها معك. أنقذ الثلاثة وتاخذ ميدالية.',
    help_rescueG: 'كبسولات الإنقاذ: روبوتات صيانة ضايعة. طيري فوقها عشان تاخذينها معاج. أنقذي الثلاثة وتاخذين ميدالية.',
    help_medals: 'كل مرحلة فيها 4 ميداليات: الإنهاء، بدون صدمة، إنقاذ الكل، والنقاط. 12 ميدالية في رحلة تفتح المستوى الصعب (مكافأة ×2).',
    help_ladder: 'سلّم المهمات: خلّص 3 مهمات وترتفع درجة، وتاخذ دراهم، والدراهم اللي تجمعها في الطيران تتضاعف أكثر (لين ×2.5).',
    help_ladderG: 'سلّم المهمات: خلّصي 3 مهمات وترتفعين درجة، وتاخذين دراهم، والدراهم اللي تجمعينها في الطيران تتضاعف أكثر (لين ×2.5).',
    help_boosters: 'المعززات من الأسطى تشتغل رحلة وحدة: شغّلها فوق زر الانطلاق.',
    help_boostersG: 'المعززات من الأسطى تشتغل رحلة وحدة: شغّليها فوق زر الانطلاق.',
    help_mozah: 'خلّص 10 مهمات وتوصل موزة، أخت عبود! تطير بنفس السفينة، وتختارها من البدلات.',
    // ---- rotate ----
    rotate: 'لفّ التلفون بالعرض!', rotateG: 'لفّي التلفون بالعرض!', rotate_hint: 'السفينة تحتاج مكان تطير فيه',
    // ---- loader ----
    ld_fonts: 'نجهّز الخطوط…', ld_art: 'نرسم عبود ونبيه والكواكب…', ld_artG: 'نرسم موزة ونبيه والكواكب…', ld_sound: 'نجهّز الأصوات…', ld_cache: 'نحفظ اللعبة للعب بدون نت…', ld_ready: 'جاهز!',
    tips: ['نصيحة: النيزك ما ينكسر إلا بشعاع الأمل.', 'نصيحة: الصخور الكريستال فيها دراهم وايد.', 'نصيحة: خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'نصيحة: عيد المراحل اللي خلصتها عشان تجمع دراهم.', 'نصيحة: الكومبو يرتفع لين ×5 لو كسّرت ورا بعض.', 'نصيحة: الدرع يصدّ صدمة كاملة.',
      'نصيحة: خلّص مهمات اليوم وخذ دراهم زيادة.', 'نصيحة: حزام الكويكبات أحسن مكان تجمع فيه دراهم.',
      'نصيحة: سلّم المهمات يضاعف الدراهم اللي تجمعها.', 'نصيحة: أول فوز في التحدي كل يوم دراهمه ×2.'],
    tipsG: ['نصيحة: النيزك ما ينكسر إلا بشعاع الأمل.', 'نصيحة: الصخور الكريستال فيها دراهم وايد.', 'نصيحة: خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'نصيحة: عيدي المراحل اللي خلصتيها عشان تجمعين دراهم.', 'نصيحة: الكومبو يرتفع لين ×5 لو كسّرتي ورا بعض.', 'نصيحة: الدرع يصدّ صدمة كاملة.',
      'نصيحة: خلّصي مهمات اليوم وخذي دراهم زيادة.', 'نصيحة: حزام الكويكبات أحسن مكان تجمعين فيه دراهم.',
      'نصيحة: سلّم المهمات يضاعف الدراهم اللي تجمعينها.', 'نصيحة: أول فوز في التحدي كل يوم دراهمه ×2.'],
    // ---- update toast ----
    update: 'نسخة جديدة من اللعبة جاهزة', updateBtn: 'حدّث',
    // ---- language picker ----
    pickTitle: 'اختر اللغة', pickHint: 'تقدر تغيّرها بعدين من العلم فوق.', lang_ar: 'العربية', lang_en: 'English',
    // ---- misc ----
    ios: 'للّعب بملء الشاشة: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».', sound: 'الصوت والموسيقى', pause: 'إيقاف مؤقت', fullscreen: 'ملء الشاشة',
    // ---- hangar ----
    hg_title: 'ورشة الأسطى', hg_note: 'كل تطوير يخلّي السفينة أقوى. هذا أحسن مكان تصرف فيه دراهمك.',
    hg_noteG: 'كل تطوير يخلّي السفينة أقوى. هذا أحسن مكان تصرفين فيه دراهمج.', hg_tier: n => `شكل السفينة ${nf(n)} من 4`,
    hg_tabUp: 'التطويرات', hg_tabBoost: 'المعززات',
    up_blaster: 'المدفع', up_blaster_d: 'ضرر أقوى ورمي أسرع',
    up_blaster_v: v => `ضرر ${nf(v.dmg)} · ${nf(v.fireRate)} طلقة/ث${v.pierce ? ' · ✦ الطلقة تخترق صخرة صغيرة' : ''}`,
    up_spread: 'المدافع التوأم', up_spread_d: 'طلقات أكثر بالمرة، على شكل مروحة',
    up_spread_v: v => `${nf(v.guns)} ${v.guns === 1 ? 'طلقة' : 'طلقات'} بالمرة`,
    up_hull: 'درع الهيكل', up_hull_d: 'نقاط هيكل أكثر، تتحمل صدمات أكثر', up_hull_dG: 'نقاط هيكل أكثر، تتحملين صدمات أكثر',
    up_hull_v: v => `${nf(v.maxHp)} نقاط هيكل${v.regen ? ` · ✦ يتصلّح نقطة كل ${nf(v.regen)} ث بدون صدمة` : ''}`,
    up_shield: 'الدرع', up_shield_d: 'فقاعة تصدّ صدمة وحدة وترجع تتشحن',
    up_shield_v: v => v.shieldCd ? `يرجع بعد ${nf(v.shieldCd)} ث${v.shieldBlast ? ' · ✦ لما ينفقع يكسّر الصخور الصغيرة حوله' : ''}` : 'ما في درع',
    up_super: 'قلب الشعاع', up_super_d: 'شعاع الأمل يتشحن أسرع ويطوّل أكثر',
    up_super_v: v => `${nf(v.superDur)} ث · شحن ×${nf(v.superGain)}${v.superPassive ? ' · يتشحن بروحه' : ''}`,
    up_engine: 'المحرك', up_engine_d: 'السفينة تلحق إصبعك أسرع', up_engine_dG: 'السفينة تلحق إصبعج أسرع',
    up_engine_v: v => `استجابة ${nf(pct(v.follow / 9))}%${v.nearMiss ? ' · ✦ النجاة من نيزك قريب تشحن الشعاع' : ''}`,
    up_magnet: 'المغناطيس', up_magnet_d: 'يجذب الدراهم صوبك', up_magnet_dG: 'يجذب الدراهم صوبج',
    up_magnet_v: v => v.magnet ? `المدى ${nf(v.magnet)}${v.pullPickups ? ' · ✦ يجذب القوى بعد' : ''}` : 'بدون مغناطيس',
    up_nabeeh: 'ذكاء نبيه', up_nabeeh_d: 'نبيه يرمي ليزر على الصخور، ومن المستوى 3 يشفط الدراهم',
    up_nabeeh_v: v => v.rate ? `ليزر ${nf(v.rate)}/ث · ضرر ${nf(v.dmg)}${v.warnPlus ? ' · ✦ ينبّه أبكر' : ''}${v.vacuum ? ' · يشفط الدراهم' : ''}${v.intercept ? ' · ✦ يصدّ الألغام في التحدي' : ''}${v.double ? ' · ليزر دبل' : ''}` : 'يطير جنبك وينبّهك',
    up_nabeeh_vG: v => v.rate ? `ليزر ${nf(v.rate)}/ث · ضرر ${nf(v.dmg)}${v.warnPlus ? ' · ✦ ينبّه أبكر' : ''}${v.vacuum ? ' · يشفط الدراهم' : ''}${v.intercept ? ' · ✦ يصدّ الألغام في التحدي' : ''}${v.double ? ' · ليزر دبل' : ''}` : 'يطير جنبج وينبّهج',
    up_lv: (k, n) => `المستوى ${nf(k)} من ${nf(n)}`, up_max: 'أعلى مستوى ✓', up_buy: n => `طوّر · ${nf(n)} د.إ`, up_buyG: n => `طوّري · ${nf(n)} د.إ`,
    up_next: 'الجاي', up_now: 'الحين', up_rec: 'الأسطى ينصح', up_trick: name => `✦ حركة جديدة: ${name}`,
    tr_pierce: 'طلقة تخترق', tr_regen: 'تصليح ذاتي', tr_shieldBlast: 'انفجار الدرع', tr_nearMiss: 'النجاة تشحن الشعاع', tr_pullPickups: 'يجذب القوى',
    tr_warn: 'تنبيه أبكر', tr_intercept: 'يصدّ الألغام', tr_double: 'ليزر دبل',
    bought: 'تم!', notEnough: 'ما عندك دراهم كفاية', notEnoughG: 'ما عندج دراهم كفاية', shopNote: 'دراهم داخل اللعبة فقط. ما في دفع حقيقي.',
    usta_tip: name => `الأسطى: سفينتك صارت قوية… جرّب ${name}!`, usta_tipG: name => `الأسطى: سفينتج صارت قوية… جرّبي ${name}!`,
    // ---- boosters ----
    bo_title: 'المعززات', bo_shield: 'درع إضافي', bo_shield_d: 'تبدأ الرحلة بشحنة درع زيادة', bo_super: 'شعاع جاهز', bo_super_d: 'شعاع الأمل يبدأ متعبي',
    bo_hull: 'هيكل إضافي', bo_hull_d: '+1 نقطة هيكل لهالرحلة', bo_coins: 'دراهم زيادة', bo_coins_d: '+0.5 لمضاعف الدراهم لهالرحلة',
    bo_have: n => `عندك ${nf(n)}`, bo_haveG: n => `عندج ${nf(n)}`, bo_arm: 'شغّله', bo_armG: 'شغّليه',
    bo_none: 'ما عندك معززات. اشترها من ورشة الأسطى.', bo_noneG: 'ما عندج معززات. اشتريها من ورشة الأسطى.', bo_used: 'المعززات شغّالة!',
    // ---- characters ----
    ch_abood: 'عبود', ch_mozah: 'موزة', ch_title: 'مع منو تطير؟', ch_titleG: 'مع منو تطيرين؟', ch_pick: 'اختار', ch_pickG: 'اختاري',
    ch_playing: 'تطير الحين', ch_playingG: 'تطيرين الحين',
    ch_lock: (n, g) => `خلّص ${nf(g)} مهمات وتنفتح · ${nf(n)} من ${nf(g)}`, ch_lockG: (n, g) => `خلّصي ${nf(g)} مهمات وتنفتح · ${nf(n)} من ${nf(g)}`,
    girlNew: 'موزة وصلت محطة فلك! اختارها من البدلات', girlNewG: 'موزة وصلت محطة فلك! اختاريها من البدلات',
    // ---- costumes ----
    cs_title: 'البدلات', cs_note: 'الألوان مجانية. البدلات الخاصة لها ميزة صغيرة، تشتريها مرة وحدة وتلبسها مع عبود أو موزة.',
    cs_noteG: 'الألوان مجانية. البدلات الخاصة لها ميزة صغيرة، تشترينها مرة وحدة وتلبسينها مع عبود أو موزة.',
    cs_colors: 'الألوان', cs_perks: 'بدلات بميزة', cs_skins: 'صبغ السفينة',
    cs_white: 'أبيض', cs_blue: 'أزرق سماوي', cs_sand: 'رملي', cs_teal: 'فيروزي غامق',
    cs_lilac: 'ليلكي', cs_rose: 'وردي', cs_mint: 'نعناعي', cs_plum: 'برقوقي غامق',
    cs_heat: 'بدلة الحرارة', cs_pilot: 'بدلة الطيار', cs_link: 'بدلة الوصلة', cs_hope: 'بدلة الأمل', cs_gold: 'البدلة الذهبية', cs_rover: 'بدلة المستكشف',
    cs_magnet: 'بدلة المغناطيس', cs_comet: 'بدلة المذنّب', cs_crystal: 'بدلة الكريستال', cs_champ: 'بدلة البطل', cs_ice: 'بدلة الثلج', cs_star: 'بدلة النجوم',
    cp_heat: '+1 نقطة هيكل', cp_pilot: 'شعاع الأمل يبدأ 30% متعبي', cp_link: 'ليزر نبيه أسرع 25%', cp_hope: 'شعاع الأمل يطوّل 0.4 ث زيادة',
    cp_gold: 'مضاعف الدراهم +0.2', cp_rover: 'علب التصليح تطلع ضعف', cp_magnet: 'المغناطيس يوصل 40 أبعد (حتى بدون تطوير)',
    cp_comet: 'السفينة أسرع وأخف', cp_crystal: 'كريستال أكثر، وكل صخرة كريستال تعطي درهم زيادة', cp_champ: 'ضرر المدفع +10%',
    cp_ice: 'تنبيه النيزك والليزر أطول 0.3 ث', cp_star: 'وقت الكومبو أطول (1.5 ث)',
    cs_linkNote: 'تحتاج ذكاء نبيه مستوى 1', cs_src_coins: 'من الأسطى بالدراهم', cs_src_badge: name => `تنفتح بوسام: ${name}`,
    cs_src_rival: name => `صلّح ${name} في التحدي`, cs_src_rivalG: name => `صلّحي ${name} في التحدي`,
    cs_src_ladder: n => `وصّل درجة ${nf(n)} في سلّم المهمات`, cs_src_ladderG: n => `وصّلي درجة ${nf(n)} في سلّم المهمات`,
    cs_src_stars: (a, b) => `جمّع ${nf(b)} نجمة · ${nf(a)} من ${nf(b)}`, cs_src_starsG: (a, b) => `جمّعي ${nf(b)} نجمة · ${nf(a)} من ${nf(b)}`,
    sk_falak: 'فلك (الأصلي)', sk_patch: 'الرقع', sk_hornet: 'الدبّور', sk_radar: 'الرادار', sk_whirl: 'الدوّامة', sk_anvil: 'السندان', sk_royal: 'الملكي',
    paint: 'لوّن السفينة', paintG: 'لوّني السفينة',
    // ---- suits (v1 names, kept) ----
    st_title: 'البدلات', st_note: 'كل الألوان مجانية. تدفع بس في البدلات اللي لها ميزة.', st_noteG: 'كل الألوان مجانية. تدفعين بس في البدلات اللي لها ميزة.',
    suit_white: 'أبيض', suit_blue: 'أزرق سماوي', suit_sand: 'رملي', suit_teal: 'فيروزي غامق', suit_heat: 'بدلة الحرارة', suit_pilot: 'بدلة الطيار', suit_gold: 'البدلة الذهبية',
    perk_heat: '+1 نقطة هيكل', perk_pilot: 'شعاع الأمل يبدأ 30% متعبي', perk_gold: 'مضاعف الدراهم +0.2 · من وسام زحل',
    free: 'مجاني', wear: 'البس', wearG: 'البسي', wearing: 'لابسها', wearingG: 'لابستها', badgeOnly: 'تنفتح بوسام',
    buy: n => `اشتر · ${nf(n)} د.إ`, buyG: n => `اشتري · ${nf(n)} د.إ`, owned: 'عندك', ownedG: 'عندج',
    // ---- missions (ms_<kind> added below) ----
    ms_title: 'المهمات', ms_daily: 'مهمات اليوم', ms_note: 'تتجدد كل يوم. استلم جوايزها من هني.', ms_noteG: 'تتجدد كل يوم. استلمي جوايزها من هني.',
    ms_bonus: n => `خلّص الثلاث اليوم: ${pl(n)} د.إ زيادة`, ms_bonusG: n => `خلّصي الثلاث اليوم: ${pl(n)} د.إ زيادة`,
    ms_prog: (a, b) => `${nf(a)} / ${nf(b)}`, ms_done: 'خلصت ✓', claim: 'استلم', claimG: 'استلمي', claimed: 'تم ✓',
    // ---- mission ladder (lm_<kind> added below) ----
    ld_title: n => `سلّم المهمات · الدرجة ${nf(n)}`, ld_mult: m => `الدراهم ${xm(m)}`,
    ld_note: (m, nx, r) => `خلّص الثلاث وتاخذ ${nf(r)} د.إ، والدراهم اللي تجمعها في الطيران تصير ${xm(nx)} بدل ${xm(m)}.`,
    ld_noteG: (m, nx, r) => `خلّصي الثلاث وتاخذين ${nf(r)} د.إ، والدراهم اللي تجمعينها في الطيران تصير ${xm(nx)} بدل ${xm(m)}.`,
    ld_skip: n => `غيّرها · ${nf(n)} د.إ`, ld_wait: 'المهمات الجديدة تنحسب من الرحلة الياية',
    ld_up: (lv, m, r) => `الدرجة ${nf(lv)}! الدراهم ${xm(m)} · ${pl(r)} د.إ`,
    // ---- stars ----
    st_1: 'إنهاء المرحلة', st_2: p => `الهيكل ${pctOf(p)}% أو أكثر`, st_3: n => `${nf(n)} نقطة`,
    rv_g_moon_a: 'برغي', rv_g_moon_a_taunt: ['ما تعدّي من هنا!', 'أنا حارس القمر!'], rv_g_moon_a_fixed: 'شكرًا! صرت أحب القمر أكثر.',
    rv_g_moon_b: 'صامولة', rv_g_moon_b_taunt: ['القمر لي أنا!', 'ارجع لمحطتك!'], rv_g_moon_b_fixed: 'عيني صارت زرقا! حلو!',
    rv_g_mars_a: 'غبار', rv_g_mars_a_taunt: ['غبار المريخ يغطيك!', 'ما أحب الزوار!'], rv_g_mars_a_fixed: 'نظّفتني من الغبار! شكرًا.',
    rv_g_mars_b: 'صدّة', rv_g_mars_b_taunt: ['صدي وأفتخر!', 'المريخ أحمر مثل عيني!'], rv_g_mars_b_fixed: 'أحس إني جديد!',
    rv_g_venus_a: 'شرارة', rv_g_venus_a_taunt: ['بزززز! حار هنا!', 'شراراتي تحرق!'], rv_g_venus_a_fixed: 'بزززز… بس ودّي.',
    rv_g_venus_b: 'إبرة', rv_g_venus_b_taunt: ['زززز! أنا أكبر من شرارة!', 'ما حد يعدّي الزهرة!'], rv_g_venus_b_fixed: 'زز… خلاص، ما ألسع.',
    rv_g_belt_a: 'حصوة', rv_g_belt_a_taunt: ['الحزام بيتي!', 'ألواحي تصدّ كل شي!'], rv_g_belt_a_fixed: 'بخلّي الصخور تعدّي بسلام.',
    rv_g_belt_b: 'ملقط', rv_g_belt_b_taunt: ['كل الحديد لي!', 'أجذب وأرمي!'], rv_g_belt_b_fixed: 'بجمع الخردة بدال ما أرميها!',
    rv_g_jupiter_a: 'رادارين', rv_g_jupiter_a_taunt: ['شفتك على الرادار!', 'ليزري ما يخطي!'], rv_g_jupiter_a_fixed: 'رادار للإنقاذ من الحين!',
    rv_g_jupiter_b: 'نبضة', rv_g_jupiter_b_taunt: ['بيب بيب! شفتك!', 'ضوّي ما يخطي!'], rv_g_jupiter_b_fixed: 'بيب… صديق!',
    rv_g_saturn_a: 'خيال', rv_g_saturn_a_taunt: ['وين أنا؟ هنا… لا هناك!', 'ما تشوفني!'], rv_g_saturn_a_fixed: 'خلاص ما أختفي عن الأصدقاء.',
    rv_g_saturn_b: 'رمشة', rv_g_saturn_b_taunt: ['وين أنا؟ خمّن!', 'رمشة عين وأختفي!'], rv_g_saturn_b_fixed: 'خلاص، ما أتخبّى.',
    rv_g_uranus_a: 'دوّار', rv_g_uranus_a_taunt: ['لفّ لفّ لفّ!', 'دوخ معي!'], rv_g_uranus_a_fixed: 'توقفت عن اللف… شوي.',
    rv_g_uranus_b: 'لفّة', rv_g_uranus_b_taunt: ['درعي يدور وما يوقف!', 'دوّخني لو تقدر!'], rv_g_uranus_b_fixed: 'وقفت اللفّة… مرتاح.',
    // ---- duels ----
    du_title: 'تحدي السفن المتمردة', du_note: 'السفن المتمردة تقابلك في نهاية كل رحلة. هنا تعيد أي معركة مجانًا، ومرة في اليوم الجائزة ×2!',
    du_noteG: 'روبوتات من خردة الفضا ضاعت وصارت متمردة. طيّحي طاقتها ونبيه يعيد برمجتها، وتصير صديقة لمحطة فلك!',
    du_lock: 'وصّل المريخ عشان تفتح التحدي', du_lockG: 'وصّلي المريخ عشان تفتحين التحدي',
    du_lockNext: name => `تنفتح بعد ما تخلّص: ${name}`, du_lockNextG: name => `تنفتح بعد ما تخلّصين: ${name}`,
    du_fight: 'تحدّاه!', du_fightG: 'تحدّيه!', du_rematch: 'عيد التحدي', b_rematch: 'عيد التحدي', du_time: 'الوقت', du_par: s => `النجمة الثالثة: أقل من ${nf(s)} ث`, du_diff: 'الصعوبة',
    du_reward: n => `الجايزة ${nf(n)} د.إ`, du_unlock: 'يفتح لك:', du_day: 'تحدي اليوم ×2', du_best: s => `أسرع وقت: ${nf(s)} ث`,
    du_win: 'الروبوت تصلّح!', du_lose: 'الروبوت غلبك هالمرة', du_loseG: 'الروبوت غلبج هالمرة', du_fixedTitle: name => `${name} صار صديق!`,
    rv_khurda: 'خردة', rv_khurda_t: 'الدرون المهزوز', rv_khurda_d: 'خزّان وقود قديم بعين حمرا وصحن ستلايت على راسه. يحب يستعرض… ويعطس وايد.',
    rv_khurda_taunt: ['أنا أقوى سفينة في المدار! …أتشووو!', 'شوف عضلاتي الحديد! …أتشو!', 'محد يقدر علي! …أتشووو!', 'هالمدار مداري!'],
    rv_khurda_fixed: 'شكرًا! أحس إني نظيف من جوّا!',
    rv_bubolt: 'بو برغي', rv_bubolt_t: 'قرصان المسامير', rv_bubolt_d: 'درون صدّي بعدسة على عينه ومفتاح بدال يده، ويرفع علم البراغي.',
    rv_bubolt_taunt: ['هات الدراهم يا بحّار الفضا!', 'كل برغي في هالفضا ملكي!', 'ارفعوا الأشرعة… قصدي المحركات!', 'هاهاها! سفينتك بتصير خردة!'],
    rv_bubolt_fixed: 'ههه، صرت قرصان طيب الحين.',
    rv_zannana: 'زنّانة', rv_zannana_t: 'الدبّورة السريعة', rv_zannana_d: 'أصغر روبوت وأسرعهم، أصفر وأسود وجناحاته تزن طول الوقت.',
    rv_zannana_taunt: ['زززز! ما تقدر تلحقني!', 'هني! لا، هني! زززز!', 'أسرع من البرق! زز!', 'زززز… دخت؟'],
    rv_zannana_fixed: 'زز… شكرًا… زز.',
    rv_magna: 'ماغنا', rv_magna_t: 'مغناطيس الخردة', rv_magna_d: 'سفينة على شكل مغناطيس، وحواليها ألواح شمسية قديمة تحميها. انتبه لا تسحب دراهمك!',
    rv_magna_taunt: ['كل الدراهم تجي لي، هذا قانون المغناطيس!', 'دراهمك؟ قصدك دراهمي!', 'تعال تعال… أنا أجذب كل شي!', 'ألواحي تحميني، حاول!'],
    rv_magna_fixed: 'خذ دراهمك… آسفة.',
    rv_radar: 'رادار', rv_radar_t: 'العين الكاشفة', rv_radar_d: 'راسه صحن أبيض يدور، ويرمي ليزر من وسطه. شوف الخط الأحمر وابعد عنه!',
    rv_radar_taunt: ['تم رصدك. تم رصدك.', 'جاري التصويب… بيب.', 'الهدف في المسار. بيب بيب.', 'لا مفر. الرادار يشوفك.'],
    rv_radar_fixed: 'رصدت… صديق جديد.',
    rv_ghummaid: 'غمّيض', rv_ghummaid_t: 'بطل الغميضة', rv_ghummaid_d: 'روبوت بنفسجي يختفي ويطلع في مكان ثاني. الظل المنقّط يقولك وين بيطلع!',
    rv_ghummaid_taunt: ['وينني؟ هني! لا، هني!', 'شفتني؟ ما شفتني!', 'واحد… اثنين… ثلاثة… طاق طاق طاقية!', 'ههه، دوّر علي!'],
    rv_ghummaid_fixed: 'خلاص، نلعب غميضة بدون صواريخ.',
    rv_dawwama: 'دوّامة', rv_dawwama_t: 'الدوّارة', rv_dawwama_d: 'سفينة مثل البلبل، تلف وترمي دوامات من الطلقات. دوّر على الفتحة بين الطلقات.',
    rv_dawwama_taunt: ['لف لف لف… دايخ؟ أنا لا!', 'الدنيا تدور، وأنا أسرع!', 'دوّخ دوّخ دوّخ!', 'ويييي! لف معاي!'],
    rv_dawwama_fixed: 'وقفت أخيرًا… الحمدلله.',
    rv_kabeer: 'كبير الخردة', rv_kabeer_t: 'ملك الساحة', rv_kabeer_d: 'سفينة أم ضخمة من ستلايتات قديمة، تاجها هوائيات معوجّة، وترمي خردة من بابها. فجّر خزاناتها عليها!',
    rv_kabeer_taunt: ['كل خردة الفضا ملكي!', 'انحني قدام الملك!', 'عندي خردة تكفي مية سنة!', 'خذ هذي… وهذي… وهذي!'],
    rv_kabeer_fixed: 'بسوّي مملكتي ساحة إعادة تدوير!',
    rv_sindan: 'سندان', rv_sindan_t: 'الحصن الحديدي', rv_sindan_d: 'دروع حديد ثقيلة ومسامير ذهب، ودرع كبير قدامه. اكسر الدرع ويدوخ شوي!',
    rv_sindan_taunt: ['ما في شي يخترق دروعي.', 'أنا… ثقيل… وما أتحرك.', 'طلقاتك تدغدغني.', 'الحديد ما ينكسر.'],
    rv_sindan_fixed: 'درعي صار يحميك الحين.',
    rv_sifr: 'صفر', rv_sifr_t: 'الذكاء الضايع', rv_sifr_d: 'سفينة سودا بخطوط حمرا وعين حلقة. ذكاء قديم من محطة مهجورة، وأصعب واحد فيهم.',
    rv_sifr_taunt: ['أنا وحيد من زمان… ابعد!', 'محد يزورني… ليش انت هني؟', 'المحطة فاضية… وأنا بعد.', 'ابعد! …لا تروح.'],
    rv_sifr_fixed: 'صديق؟ …أول مرة أسمعها.', rv_sifr_bot: 'صفر ما كان شرير، كان وحيد بس.',
    // ---- login ----
    lg_title: 'هدية الدخول اليومية', lg_day: n => `اليوم ${nf(n)}`, lg_claim: n => `استلم ${nf(n)} د.إ`, lg_claimG: n => `استلمي ${nf(n)} د.إ`,
    lg_done: 'استلمت هدية اليوم. ارجع باجر!', lg_doneG: 'استلمتي هدية اليوم. ارجعي باجر!', lg_streak: n => `${nf(n)} أيام ورا بعض`,
    lg_booster: '+ معزز درع هدية', lg_welcome: 'هدية الرجعة: معزز شعاع جاهز',
    // ---- badges ----
    bg_title: 'الأوسمة', bg_tiered: 'كل وسام له 3 مستويات: برونزي ثم فضي ثم ذهبي. كل مستوى هدف أكبر وجايزة أكبر.',
    bg_count: (a, b) => `${nf(a)} من ${nf(b)}`, bg_locked: 'مقفل', bg_reward: n => `${pl(n)} د.إ`, bg_prog: (a, b) => `${nf(a)} من ${nf(b)}`,
    tier_0: 'برونزي', tier_1: 'فضي', tier_2: 'ذهبي', tier_none: 'لسه ما بديت', tier_all: 'كل المستويات ✓',
    bg_first: 'أول طيران', bg_first_d: 'طِر أول مرة من محطة فلك', bg_first_dG: 'طيري أول مرة من محطة فلك',
    bg_hangar: 'زبون الأسطى', bg_hangarG: 'زبونة الأسطى', bg_hangar_d: 'اشتر أول تطوير من الورشة', bg_hangar_dG: 'اشتري أول تطوير من الورشة',
    bg_moon: 'وصلنا القمر!', bg_moon_d: 'خلّص رحلة القمر', bg_moon_dG: 'خلّصي رحلة القمر',
    bg_mars: 'الكوكب الأحمر', bg_mars_d: 'خلّص رحلة المريخ', bg_mars_dG: 'خلّصي رحلة المريخ',
    bg_saturn: 'سيد الحلقات', bg_saturnG: 'سيدة الحلقات', bg_saturn_d: 'خلّص رحلة زحل، وتفتح لك البدلة الذهبية', bg_saturn_dG: 'خلّصي رحلة زحل، وتفتح لج البدلة الذهبية',
    bg_tour: 'الجولة الكبرى', bg_tour_d: 'وصّل نبتون، آخر كوكب! ويفتح لك الصبغ الملكي', bg_tour_dG: 'وصّلي نبتون، آخر كوكب! ويفتح لج الصبغ الملكي',
    bg_duel1: 'أول تصليح', bg_duel1_d: 'صلّح أول روبوت متمرد في التحدي', bg_duel1_dG: 'صلّحي أول روبوت متمرد في التحدي',
    bg_champion: 'بطل التحدي', bg_championG: 'بطلة التحدي', bg_champion_d: 'صلّح صفر، آخر روبوت متمرد', bg_champion_dG: 'صلّحي صفر، آخر روبوت متمرد',
    bg_stars24: '24 نجمة', bg_stars24_d: 'جمّع 24 نجمة في المراحل', bg_stars24_dG: 'جمّعي 24 نجمة في المراحل',
    bg_stars48: '48 نجمة', bg_stars48_d: 'جمّع 48 نجمة، وتفتح لك بدلة النجوم', bg_stars48_dG: 'جمّعي 48 نجمة، وتفتح لج بدلة النجوم',
    bg_stars72: 'كل النجوم', bg_stars72_d: 'جمّع كل الـ72 نجمة', bg_stars72_dG: 'جمّعي كل الـ72 نجمة',
    bg_mozah: 'موزة في الفضاء', bg_mozah_d: 'طِر مرة وحدة مع موزة', bg_mozah_dG: 'طيري أول رحلة لج يا موزة',
    bc_rocks: 'مكسّر الصخور', bc_rocksG: 'مكسّرة الصخور', bc_rocks_d: g => `كسّر ${nf(g)} صخرة وخردة`, bc_rocks_dG: g => `كسّري ${nf(g)} صخرة وخردة`,
    bc_meteors: 'ضد النيازك', bc_meteors_d: g => `افلت من ${nf(g)} نيزك`, bc_meteors_dG: g => `افلتي من ${nf(g)} نيزك`,
    bc_coins: 'جامع الدراهم', bc_coinsG: 'جامعة الدراهم', bc_coins_d: g => `اجمع ${nf(g)} د.إ في الطيران`, bc_coins_dG: g => `اجمعي ${nf(g)} د.إ في الطيران`,
    bc_supers: 'شعاع الأمل', bc_supers_d: g => `استخدم الشعاع ${nf(g)} مرة`, bc_supers_dG: g => `استخدمي الشعاع ${nf(g)} مرة`,
    bc_legs: 'الطيار المداوم', bc_legsG: 'الطيارة المداومة', bc_legs_d: g => `خلّص ${nf(g)} مرحلة`, bc_legs_dG: g => `خلّصي ${nf(g)} مرحلة`,
    bc_planets: 'المستكشف', bc_planetsG: 'المستكشفة', bc_planets_d: g => `وصّل كوكب ${nf(g)} مرة`, bc_planets_dG: g => `وصّلي كوكب ${nf(g)} مرة`,
    bc_nohit: 'ولا خدش', bc_nohit_d: g => `خلّص ${nf(g)} مرحلة بدون ولا صدمة`, bc_nohit_dG: g => `خلّصي ${nf(g)} مرحلة بدون ولا صدمة`,
    bc_crystals: 'صياد الكريستال', bc_crystalsG: 'صيادة الكريستال', bc_crystals_d: g => `كسّر ${nf(g)} صخرة كريستال`, bc_crystals_dG: g => `كسّري ${nf(g)} صخرة كريستال`,
    bc_chains: 'خبير الانفجارات', bc_chainsG: 'خبيرة الانفجارات', bc_chains_d: g => `كسّر ${nf(g)} شي بانفجار خزانات الوقود`, bc_chains_dG: g => `كسّري ${nf(g)} شي بانفجار خزانات الوقود`,
    bc_duels: 'مصلّح الروبوتات', bc_duelsG: 'مصلّحة الروبوتات', bc_duels_d: g => `افز في ${nf(g)} تحدي`, bc_duels_dG: g => `افزي في ${nf(g)} تحدي`,
    bc_ladder: 'متسلّق السلّم', bc_ladderG: 'متسلّقة السلّم', bc_ladder_d: g => `وصّل الدرجة ${nf(g)} في سلّم المهمات`, bc_ladder_dG: g => `وصّلي الدرجة ${nf(g)} في سلّم المهمات`,
    bc_loyal: 'الوفي', bc_loyalG: 'الوفية', bc_loyal_d: g => `ادخل اللعبة ${nf(g)} أيام ورا بعض`, bc_loyal_dG: g => `ادخلي اللعبة ${nf(g)} أيام ورا بعض`,
    // ---- robots: Nabeeh (cheeky, smart) ----
    bot_start: ['يلا يا عبود، اربط الحزام!', 'الأنظمة كلها تمام… تقريبًا.', 'جاهز يا كابتن؟ أنا جاهز من أمس!', 'حسبت الطريق 100 مرة، وطلع زين.',
      'بسم الله، انطلقنا!', 'تذكّر: الصخور ما تعرف تقول آسفة.', 'ماما على الراديو تقول: لا تتأخرون على العشا!', 'شغّلت الرادار، والمكيف بعد.'],
    bot_startG: ['يلا يا موزة، اربطي الحزام!', 'جاهزة يا كابتنة؟ أنا جاهز من أمس!', 'عبود على الراديو يقول: انتبهي على سفينتي! هههه', 'ماما تقول: لا تتأخرين على العشا!',
      'بسم الله، انطلقنا!', 'تذكّري: الصخور ما تعرف تقول آسفة.', 'الأنظمة كلها تمام… تقريبًا.', 'شغّلت الرادار، والمكيف بعد.'],
    bot_hit: ['آخ! هذي جت في الجناح!', 'انتبه! السفينة مب سيارة صدامات!', 'ما عليه، الأسطى بيصلحها.', 'صخرة قليلة أدب!', 'أوف! حسيتها في دوايري.',
      'شوي شوي، ترى الهيكل يحس!', 'ركّز يا كابتن!', 'هذي الصخرة ما شافت الإشارة.'],
    bot_hitG: ['آخ! هذي جت في الجناح!', 'انتبهي! السفينة مب سيارة صدامات!', 'ما عليه، الأسطى بيصلحها.', 'صخرة قليلة أدب!', 'أوف! حسيتها في دوايري.',
      'شوي شوي، ترى الهيكل يحس!', 'ركّزي يا كابتنة!', 'هذي الصخرة ما شافت الإشارة.'],
    bot_meteor: ['نيزك! اطلع ولا انزل، بس لا توقف!', 'انتبه! نيزك جاي بسرعة الصاروخ!', 'شي يولّع جاي! تحرّك!', 'نيزك! ما ينكسر إلا بالشعاع!',
      'هذا مب صخرة، هذا نار طايرة!', 'الخط الأحمر يعني ابعد عنه!'],
    bot_meteorG: ['نيزك! اطلعي ولا انزلي، بس لا توقفين!', 'انتبهي! نيزك جاي بسرعة الصاروخ!', 'شي يولّع جاي! تحرّكي!', 'نيزك! ما ينكسر إلا بالشعاع!',
      'هذا مب صخرة، هذا نار طايرة!', 'الخط الأحمر يعني ابعدي عنه!'],
    bot_super: ['شعاع الأمل جاهز! اضغط الزر الكبير!', 'يلا! ورّهم شعاع الأمل!', 'الشحنة فل! خلّها تلمع!', 'وااو! شوف كيف تذوب الصخور!',
      'هذا الشعاع أقوى من شمس الظهر في الصيف!', 'نوّرت الفضا كله!'],
    bot_superG: ['شعاع الأمل جاهز! اضغطي الزر الكبير!', 'يلا! ورّيهم شعاع الأمل!', 'الشحنة فل! خلّيها تلمع!', 'وااو! شوفي كيف تذوب الصخور!',
      'هذا الشعاع أقوى من شمس الظهر في الصيف!', 'نوّرتي الفضا كله!'],
    bot_combo: ['كومبو! انت نار!', 'ورا بعض ورا بعض! كمّل!', 'يا سلام عليك يا عبود!', 'حتى أنا ما أحسبها بهالسرعة!', 'هذا لعب محترفين!',
      'كمّل كمّل، الدراهم تحبك!', 'دوايري ترقص من الفرحة!'],
    bot_comboG: ['كومبو! انتي نار!', 'ورا بعض ورا بعض! كمّلي!', 'يا سلام عليج يا موزة!', 'حتى أنا ما أحسبها بهالسرعة!', 'هذا لعب محترفات!',
      'كمّلي كمّلي، الدراهم تحبج!', 'دوايري ترقص من الفرحة!'],
    bot_lowhp: ['الهيكل تعبان! دوّر على علبة التصليح!', 'تحذير: السفينة صارت مثل علبة عصير مدعوسة.', 'شوي بعد ونصير قطع غيار! انتبه!',
      'خلّك بعيد عن الصخور الحين!', 'وضعنا حرج… بس أنا واثق فيك!', 'لو ماما تشوفنا الحين بتعصب!'],
    bot_lowhpG: ['الهيكل تعبان! دوّري على علبة التصليح!', 'تحذير: السفينة صارت مثل علبة عصير مدعوسة.', 'شوي بعد ونصير قطع غيار! انتبهي!',
      'خلّج بعيدة عن الصخور الحين!', 'وضعنا حرج… بس أنا واثق فيج!', 'لو ماما تشوفنا الحين بتعصب!'],
    bot_win: ['خلّصنا المرحلة! أنا فخور فيك!', 'هبّة! عدّينا سالمين!', 'يا سلام! الأسطى بيفرح بالدراهم.', 'مبروك يا كابتن! نستاهل استراحة.',
      'سجّلتها في ذاكرتي: عبود بطل!', 'رحلة زينة! بس لا تقول للصخور.'],
    bot_winG: ['خلّصنا المرحلة! أنا فخور فيج!', 'هبّة! عدّينا سالمين!', 'يا سلام! الأسطى بيفرح بالدراهم.', 'مبروك يا كابتنة! نستاهل استراحة.',
      'سجّلتها في ذاكرتي: موزة بطلة!', 'عبود بيغار لما يسمع، هههه.', 'رحلة زينة! بس لا تقولين للصخور.'],
    bot_lose: ['ما عليه، كل رواد الفضا يطيحون مرة!', 'السفينة تكسّرت… بس الدراهم معانا!', 'خلّنا نرجع للأسطى ونطوّر السفينة.',
      'المرة الياية بنسويها! متأكد 99%.', 'لا تزعل، حتى القمر يختفي ويرجع كل شهر!', 'أنصحك كصديق: طوّر الدرع.'],
    bot_loseG: ['ما عليه، كل رواد الفضا يطيحون مرة!', 'السفينة تكسّرت… بس الدراهم معانا!', 'خلّينا نرجع للأسطى ونطوّر السفينة.',
      'المرة الياية بنسويها! متأكد 99%.', 'لا تزعلين، حتى القمر يختفي ويرجع كل شهر!', 'أنصحج كصديق: طوّري الدرع.'],
    bot_menu: ['تدري؟ النيزك ما ينكسر إلا بشعاع الأمل.', 'الصخور الكريستال فيها دراهم وايد!', 'خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'عيد المراحل عشان تجمع دراهم أكثر.', 'الأسطى يقدر يركّب لي ليزر… لو تدفع!', 'خلّص مهمات اليوم وخذ دراهم زيادة.',
      'أنا نبيه، واليوم أحس إني نبيه زيادة.', 'القمر ينتظرنا، والقهوة بعد.', 'ماما اتصلت تسأل: أكلت؟ قلت لها: بعد شوي!'],
    bot_menuG: ['تدرين؟ النيزك ما ينكسر إلا بشعاع الأمل.', 'الصخور الكريستال فيها دراهم وايد!', 'خزّان الوقود ينفجر ويكسّر اللي حواليه.',
      'عيدي المراحل عشان تجمعين دراهم أكثر.', 'الأسطى يقدر يركّب لي ليزر… لو تدفعين!', 'خلّصي مهمات اليوم وخذي دراهم زيادة.',
      'عبود يقول إنج تطيرين أحسن منه… لا تقولين له إني قلت!', 'أنا نبيه، واليوم أحس إني نبيه زيادة.', 'ماما اتصلت تسأل: أكلتي؟ قلت لها: بعد شوي!'],
    bot_arrive: ['شوف! الكوكب قدامنا!', 'دخلنا المدار! صوّر صوّر!', 'حلم عبود صار حقيقة!', 'بطاقة جديدة للمجموعة!'],
    bot_arriveG: ['شوفي! الكوكب قدامنا!', 'دخلنا المدار! صوّري صوّري!', 'حلم موزة صار حقيقة!', 'بطاقة جديدة للمجموعة!'],
    bot_shield: ['الدرع صدّها!', 'الدرع شغّال، ولا يهمك!', 'فقاعتي حمتك!'],
    bot_shieldG: ['الدرع صدّها!', 'الدرع شغّال، ولا يهمج!', 'فقاعتي حمتج!'],
    bot_pickup: ['زين! خذها!', 'هذي تنفعنا!', 'هدية من الفضا!'],
    bot_pickupG: ['زين! خذيها!', 'هذي تنفعنا!', 'هدية من الفضا!'],
    bot_duel: ['هذا الروبوت ضايع، خلّنا نصلحه!', 'ركّز على العين الحمرا!', 'طيّح طاقته وأنا أعيد برمجته!', 'لا تخاف، الروبوتات المتمردة بس محتاجة صديق.'],
    bot_duelG: ['هذا الروبوت ضايع، خلّينا نصلحه!', 'ركّزي على العين الحمرا يا موزة!', 'طيّحي طاقته وأنا أعيد برمجته!', 'لا تخافين، الروبوتات المتمردة بس محتاجة صديق.'],
    bot_duelWin: ['برمجته! عينه صارت زرقا!', 'صديق جديد لمحطة فلك!', 'شغل نظيف يا كابتن!', 'قال لي شكرًا… بلغة البيب بوب.'],
    bot_duelWinG: ['برمجته! عينه صارت زرقا!', 'صديق جديد لمحطة فلك!', 'شغل نظيف يا كابتنة!', 'قال لي شكرًا… بلغة البيب بوب.'],
    bot_duelLose: ['ما عليه، هالروبوت قوي. طوّر المدفع وارجع له!', 'المرة الياية بنصلحه، أكيد!', 'جرّب تطوّر الدرع والهيكل عند الأسطى.', 'شفت حركاته؟ الحين نعرفها!'],
    bot_duelLoseG: ['ما عليه، هالروبوت قوي. طوّري المدفع وارجعي له!', 'المرة الياية بنصلحه، أكيد!', 'جرّبي تطوّرين الدرع والهيكل عند الأسطى.', 'شفتي حركاته؟ الحين نعرفها!'],
    bot_welcome: ['اشتقنا لك! جبت لك شعاع جاهز هدية.', 'هلا والله! المحطة كانت ساكتة بدونك.', 'رجعت! الأسطى خلّى لك هدية.'],
    bot_bump: ['أوبس! ما صار شي، كمّل!', 'طق! السفينة قوية، لا تخاف.', 'هههه، صخرة مزاحة!', 'ولا يهمك، كمّل طيران!'],
    bot_bumpG: ['أوبس! ما صار شي، كمّلي!', 'طق! السفينة قوية، لا تخافين.', 'هههه، صخرة مزاحة!', 'ولا يهمج، كمّلي طيران!'],
    bot_respawn: ['رجعنا! الدرع جديد!', 'ما في مشكلة، السفينة تصلّح نفسها!', 'يلا من جديد، أنا معك!'],
    bot_respawnG: ['رجعنا! الدرع جديد!', 'ما في مشكلة، السفينة تصلّح نفسها!', 'يلا من جديد، أنا معاج!'],
    bot_boss: ['تحذير! السفينة المتمردة جاية!', 'هذا الكبير! جهّز شعاع الأمل!', 'ركّز يا كابتن، المعركة الكبيرة!'],
    bot_bossG: ['تحذير! السفينة المتمردة جاية!', 'هذا الكبير! جهّزي شعاع الأمل!', 'ركّزي يا كابتنة، المعركة الكبيرة!'],
    bot_guardian: ['روبوت حارس قدامنا! طيّح طاقته!', 'حارس صغير، تقدر عليه!', 'شوف! حارس المرحلة!'],
    bot_guardianG: ['روبوت حارس قدامنا! طيّحي طاقته!', 'حارس صغير، تقدرين عليه!', 'شوفي! حارس المرحلة!'],
    bot_rescue: ['أنقذنا روبوت! قال شكرًا بالبيب بوب.', 'روبوت صيانة ضايع… طر فوقه!', 'كبسولة إنقاذ! خذها معنا!'],
    bot_rescueG: ['أنقذنا روبوت! قال شكرًا بالبيب بوب.', 'روبوت صيانة ضايع… طيري فوقه!', 'كبسولة إنقاذ! خذيها معانا!'],
    bot_grabbed: ['هييه! خلّني! اضرب الخطّاف!', 'عبود! الخطّاف ماسكني!'], bot_grabbedG: ['هييه! خلّيني! اضربي الخطّاف!', 'موزة! الخطّاف ماسكني!'],
    bot_freed: ['شكرًا! رجعت حر!', 'خلاص، فكّيت! يلا نكمّل.'],
    bot_flare: ['انفجار شمسي! تخبّى ورا صخرة كبيرة!', 'الشمس عصّبت! دوّر صخرة تحميك!'], bot_flareG: ['انفجار شمسي! تخبّي ورا صخرة كبيرة!', 'الشمس عصّبت! دوّري صخرة تحميج!'],
    bot_corridor: ['محطة مهجورة! عدّل الطريق بين الحيطان!', 'انتبه، الممر ضيق!'], bot_corridorG: ['محطة مهجورة! عدّلي الطريق بين الحيطان!', 'انتبهي، الممر ضيق!'],
    bot_welcomeG: ['اشتقنا لج! جبت لج شعاع جاهز هدية.', 'هلا والله! المحطة كانت ساكتة بدونج.', 'رجعتي! الأسطى خلّى لج هدية.'],
    // ---- robots: Usta (hangar) ----
    usta_lines: ['هلا والله بالكابتن! شو نركّب اليوم؟', 'المدفع يبا له تطوير، صدقني.', 'السفينة هذي غالية علي مثل ولدي.', 'كل مسمار هني له قصة.',
      'الدرع يحميك، والدرع يبا دراهم.', 'نبيه يبا ليزر؟ خلّه يقول من فضلك.', 'مفتاحي جاهز، وانت؟', 'لا تنسى: المحرك الزين يخليك تفلت من النيازك.'],
    usta_linesG: ['هلا والله بالكابتنة موزة! شو نركّب اليوم؟', 'صدقيني، المدفع يبا له تطوير.', 'أخوج كسر الجناح أمس… انتي لا تسوين مثله!', 'مفتاحي جاهز، وانتي؟',
      'الدرع يحميج، والدرع يبا دراهم.', 'نبيه يبا ليزر؟ خلّيه يقول من فضلك.', 'السفينة هذي غالية علي مثل عيالي.', 'لا تنسين: المحرك الزين يخليج تفلتين من النيازك.'],
    usta_buy: ['تم! السفينة صارت أقوى.', 'شغل نظيف، مثل العادة.', 'اسمع صوت المحرك… فخامة!', 'ركّبناها! جرّبها في الفضا.'],
    usta_buyG: ['تم! السفينة صارت أقوى.', 'شغل نظيف، مثل العادة.', 'اسمعي صوت المحرك… فخامة!', 'ركّبناها! جرّبيها في الفضا.'],
    usta_poor: ['الدراهم ما تكفي يا كابتن، روح جيب صخور كريستال.', 'ما يصير بالدين، هههه!', 'عيد كم مرحلة وتعال.'],
    usta_poorG: ['الدراهم ما تكفي يا كابتنة، روحي جيبي صخور كريستال.', 'ما يصير بالدين، هههه!', 'عيدي كم مرحلة وتعالي.'],
    usta_max: ['هذا أعلى شي عندي! ما في أقوى منه.', 'خلاص، هذي فل الفل!'],
    // ---- postcard facts (real, kid-friendly) ----
    fact_earth: 'الأرض لونها أزرق من الفضا لأن الماي يغطي تقريبًا 70% منها.',
    fact_moon: 'القمر يبعد عن الأرض تقريبًا 384 ألف كيلومتر، ونشوف منه دايمًا نفس الوجه!',
    fact_mars: 'المريخ أحمر لأن ترابه فيه صدأ، وفيه أعلى بركان في المجموعة الشمسية: أوليمبوس مونس.',
    fact_venus: 'الزهرة أحر كوكب في المجموعة الشمسية، حرارتها تذوّب الرصاص! وهي أحر من عطارد مع إنه أقرب للشمس.',
    fact_belt: 'حزام الكويكبات بين المريخ والمشتري فيه ملايين الصخور، بس المسافات بينها كبيرة وايد، والمركبات الحقيقية تعدّي من بينها بسلام.',
    fact_jupiter: 'المشتري أكبر كوكب، والبقعة الحمراء العظيمة فيه عاصفة أكبر من كوكب الأرض كله!',
    fact_saturn: 'حلقات زحل مصنوعة من قطع ثلج وصخر، بعضها صغير مثل حبة الرمل وبعضها كبير مثل البيت.',
    fact_uranus: 'أورانوس يدور على جنبه، كأنه كورة تتدحرج حول الشمس!',
    fact_neptune: 'في نبتون أسرع رياح في المجموعة الشمسية، توصل تقريبًا 2000 كيلومتر في الساعة!',
  },
  en: {
    // ---- general ----
    title: 'Abood to the Moon',
    kicker: 'Nabeeh is ready, the ship is ready… are you?',
    story: 'Abood grew up to be the youngest astronaut on Falak Station, high above Earth, where he lives with his clever robot Nabeeh. His dream since he was little: fly to the Moon, and then to every planet! Usta gets the ship ready, Nabeeh works out the route… and rocks, space junk and meteors are waiting.',
    storyG: "Mozah, Abood's sister, finished her training and joined Falak Station! She flies the same family ship with Nabeeh, and Usta gets it ready for her. Her dream: tour every planet in the solar system… and fix every rogue robot she meets on the way!",
    story_short: 'From Falak Station to the Moon… and then every planet!',
    station: 'Falak Station', n_abood: 'Abood', n_aboodG: 'Mozah', n_nabeeh: 'Nabeeh', n_usta: 'Usta',
    coins: n => `AED ${nf(n)}`, cur: 'AED', arrow: '→', sec: 's',
    // ---- buttons ----
    b_launch: 'Launch!', b_hangar: "Usta's hangar", b_suits: 'Costumes', b_costumes: 'Costumes', b_missions: 'Missions', b_duels: 'Duels',
    b_badges: 'Badges', b_help: 'How to play', b_close: 'Close', b_back: 'Back', b_station: 'Station', b_next: 'Next leg',
    b_retry: 'Try again', b_resume: 'Resume', b_quit: 'Back to station', b_menu: 'Menu', b_ok: 'OK', b_fullscreen: 'Fullscreen', b_replay: 'Replay',
    // ---- menu ----
    m_journeys: 'Your journeys', m_legs: 'Legs', m_leg: i => `Leg ${nf(i + 1)}`, m_legOf: (i, n) => `Leg ${nf(i + 1)} of ${nf(n)}`,
    m_locked: 'Locked', m_lockedHint: name => `Reach ${name} first to unlock`, m_done: 'Done ✓', m_new: 'New!',
    m_replay: 'Replay · 35% of the reward', m_reward: n => `Reward AED ${nf(n)}`, m_bonus: n => `Arrival bonus AED ${nf(n)}`,
    m_route: (a, b) => `${a} → ${b}`, m_best: n => `Best score: ${nf(n)}`, m_legsDone: (a, b) => `${nf(a)} of ${nf(b)}`,
    m_next: name => `Next: ${name}`, m_allDone: 'You toured the whole solar system! Replay any leg to collect dirhams.',
    // ---- gates (ship level) ----
    m_need: (n, have) => `Usta: we need ship level ${nf(n)}, you have ${nf(have)}. Upgrade the ship in the hangar!`,
    m_needShort: n => `Level ${nf(n)}`,
    r_gateNear: (n, name) => n > 1 ? `${nf(n)} more upgrades to unlock ${name}` : `1 more upgrade to unlock ${name}`,
    a_shipLv: n => `Ship level ${nf(n)}`,
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
    h_shield: 'Shield', h_rapid: 'Rapid fire', h_prog: (a, b) => `${a} → ${b}`, h_rival: 'Rogue robot',
    hint: 'Drag up and down to move the ship. The blaster fires by itself!',
    // ---- a11y ----
    a_pause: 'Pause', a_sound: 'Sound and music', a_super: 'Amal Beam', a_lang: 'Language', a_coins: 'Your dirhams',
    a_hp: (n, m) => `Hull ${nf(n)} of ${nf(m)}`, a_close: 'Close', a_stars: n => `${nf(n)} of 3 stars`,
    // ---- floating text ----
    f_meteor: 'Meteor!', f_superReady: 'Amal Beam ready!', f_repair: '+1 hull', f_shield: 'Shield!', f_shieldUp: 'Shield back up',
    f_shieldPop: 'The shield saved you!', f_cell: '+35% charge', f_rapid: 'Rapid fire!', f_combo: n => `Combo ×${n}`, f_newBest: 'New best!',
    f_mission: 'Mission done!', f_badge: name => `New badge: ${name}`, f_halfway: 'Halfway there!', f_lowhp: 'Hull is weak!',
    f_legDone: 'Leg complete!', f_arrive: name => `We reached ${name}!`, f_unlocked: name => `New journey: ${name}!`, f_coins: n => `AED ${nf(n)}`,
    f_chain: 'Chain blast!', f_duel: 'Duel!', f_enrage: 'The robot is angry! Faster now!', f_fixed: name => `${name} is fixed!`, f_shieldBreak: 'Shield broken!',
    // v3
    f_warning: 'WARNING!', f_bump: 'Bump!', f_respawn: 'Back in action!', f_hard: 'Hard tier', f_rescued: 'Robot rescued!', f_freed: 'Nabeeh is free!', f_grabbed: 'They grabbed Nabeeh!',
    f_flare: 'Solar flare! Hide behind a rock!', f_flareG: 'Solar flare! Hide behind a rock!', f_cascade: 'Rock cascade!', f_scrapRain: 'Scrap rain! All coins!',
    f_corridor: 'Derelict station! Steer through!', f_corridorG: 'Derelict station! Steer through!', f_turret: 'Guard turret! Mind its shots!', f_turretG: 'Guard turret! Mind its shots!',
    r_bossReward: 'Robot prize', r_bossFixed: name => `${name} is fixed and a friend now!`, r_medalPay: n => `New medals +AED ${nf(n)}`, r_medals: 'Medals',
    r_rescued: (a, b) => `Rescued ${nf(a)} of ${nf(b)} robots`, r_rescuedG: (a, b) => `Rescued ${nf(a)} of ${nf(b)} robots`,
    md_finish: 'Finish the leg', md_finishG: 'Finish the leg', md_noDamage: 'No damage at all', md_rescue: 'Rescue every robot', md_rescueG: 'Rescue every robot', md_score: n => `Score ${nf(n)}`,
    md_hard: 'All medals! The Hard tier of this journey is open.', b_hard: 'Hard', b_hardOff: 'Normal', hd_note: 'Hard tier: faster and tougher, rewards ×2.',
    // ---- results ----
    r_win: 'Leg complete!', r_arrive: name => `You reached ${name}!`, r_fail: 'Mission failed', r_failHint: 'You keep the dirhams you picked up. The reward is waiting for next time.',
    r_score: 'Score', r_best: 'Best', r_newBest: 'New best!', r_kills: 'Destroyed', r_picked: 'Dirhams picked up', r_reward: 'Leg reward', r_duelReward: 'Duel prize',
    r_replay: 'Replay reward (35%)', r_bonus: 'Arrival bonus', r_total: 'Total', r_kept: 'Dirhams picked up', r_meteors: 'Meteors dodged',
    r_hits: 'Hits', r_noHit: 'Not a single hit!', r_unlocked: name => `New journey unlocked: ${name}`, r_badges: 'New badges', r_missions: 'Missions done',
    r_none: 'Nothing new this time.', r_postcard: name => `Postcard from ${name}`, r_factTitle: 'Did you know?', r_tryUpgrade: 'Try upgrading the ship at Usta’s hangar!',
    r_coinMult: m => `Coin multiplier ×${nf(m ?? 1)}`, r_levelUp: 'Mission ladder: new level!', r_girl: 'Mozah joined Falak Station!',
    r_stars: 'Stars', r_starPay: n => `New stars +AED ${nf(n)}`, r_nextStar: (n, have) => `Third star: score ${nf(n)}, you got ${nf(have)}`,
    r_dayBonus: 'Duel of the day ×2',
    // ---- pause ----
    pa_title: 'Paused', pa_hint: 'Tap Resume or press P to fly again',
    // ---- help ----
    a_fps: 'Frame rate', fps_l: n => n === 30 ? 'Battery saver: 30 fps' : 'Smooth: 60 fps', fps_note: n => n === 30 ? 'Battery saver: 30 fps, the phone stays cooler' : 'Smooth: 60 fps',
    help_title: 'How to play', help_s_controls: 'Controls', help_s_space: 'Out in space', help_s_ship: 'Your ship', help_s_trips: 'Journeys',
    help_story: 'Every journey to a planet has 3 legs. Finish the third leg to reach the planet and unlock the next journey.',
    help_move: 'Drag anywhere: the ship flies up, down, forward and back in the left part of the screen. On a computer: the arrows or W A S D.',
    help_moveG: 'Drag anywhere: the ship flies up, down, forward and back in the left part of the screen. On a computer: the arrows or W A S D.',
    // v3.1
    f_graze: 'Graze!', f_rage: 'RAGE!', f_wingJoin: 'New wingman!', f_wingSave: 'Saved you!', f_wingSaveG: 'Saved you!', f_partDown: 'Part down!', f_coreOpen: 'Core open!', f_advance: 'It is coming closer!', f_desp: 'Last stand!',
    bh_clam: 'Its blast doors are shut! Wait for them to open, then shoot!', bh_bubble: 'Each bubble splits in two! Pop the small ones for coins.',
    bh_hornet: 'See the dotted line? That is where the hornet will fly. Stay off it!', bh_magnet: 'The magnet wears scrap as armour. Break it before it flings it!',
    bh_search: "Don't stay in the searchlight! Hide behind the rocks, then peek out and shoot.", bh_hide: 'Hide and seek! Find the one whose eye sparkles.',
    bh_vortex: 'The armour spins! Shoot through the gap.', bh_builder: 'The Scrap King builds a wall! Shoot a tunnel to the core.',
    bh_hammer: 'The hammer falls in the red column! Then hit the yellow joint.',
    bc_boss: 'BOSS', bc_guard: 'GUARDIAN', bc_s1: 'THE LITTLE ONE', bc_s2: 'ALL GROWN UP', bc_s3: 'BOSS',
    bc_q_khurda: 'THE GIANT WRECK', bc_q_bubolt: 'THE PIRATE SHIP', bc_q_zannana: 'THE HIVE QUEEN', bc_q_magna: 'THE GIANT MAGNET', bc_q_radar: 'THE GREAT ARRAY',
    bc_q_ghummaid: 'THE MIRROR MOON', bc_q_dawwama: 'THE CYCLONE', bc_q_sifr: 'ZERO PRIME',
    bq_brood: ['Go, my little ones!', 'Out you fly!'], bq_royal: ['Now feel my size!', 'Nowhere is safe!'],
    bot_family: ['They are one family! The little ones first, then the big one!', 'A robot family. The biggest waits at the end!'], bot_giant: ['A giant! The biggest of the family!', 'Whoa, it is huge! Watch for its trick!'], f_decoy: 'Wrong one!', f_found: 'Found you!', f_supply: 'Supply drop!', f_wpUp: 'Level up!',
    bot_found: ['Nice! You found it!', 'Sharp eyes!'], bot_orb: ['You can shoot the grey scrap balls!', 'Grey balls break. Pink ones you dodge!'],
    // v3.4: the boss brain speaks (bq_*), and Nabeeh's tips about it
    bq_camp: ['You keep hiding there!', 'Same spot again? Easy!'], bq_ouch: ['Ouch! Shields up!', 'Hey! That hurt!'], bq_hit: ['Got you!', 'Ha! Too slow!'],
    bq_learn: 'This got you last time!', bq_again: 'You again? I remember your tricks!', bq_study: 'I studied your fights. I know where you slip!',
    bq_feint: ['Fooled you!', 'Changed my mind!'], bq_lost: ['Hm? Where did you go?', 'It was right here…'], bq_see: ['I see you!', 'Found you!'],
    bq_dodge: ['Missed me!', "I'm faster!"], bq_scared: 'Stay back! Stay back!', bq_toy: 'New toy? Watch this!',
    bq_knock: 'Stop knocking on my shell!', bq_tickle: 'Hee hee! That tickles!', bq_flush: ['Come out of there!', 'No place to hide!'], bq_seal: 'Seal the hole!',
    bq_read: 'You always run that way!', bq_lucky: 'Lucky guess! Faster now!', bq_suck: 'Come back, my bubbles!', bq_pull: 'Come closer!',
    bot_brain: 'Careful! This robot is watching what you do. Do not stay in one place!', bot_nerv: 'Aim at each box: the real one gets nervous and sweats!',
    bot_carrier: ['See that little cargo drone? Shoot it for a gift!', 'Supply drone! Shoot it open!'],
    bot_capsule: ['The capsule changes colour. Grab it when it shows the weapon you want!', 'Same weapon again makes it stronger!'],
    mod_title: 'Space weather', mod_ion: 'Ion storm: slower shots, faster rocks', mod_dark: 'Dark sector: you only see what is near', mod_magnet: 'Magnetic field: pulls the ship up and down', mod_wind: 'Solar wind: everything drifts',
    wp_spread: 'Spread', wp_laser: 'Laser', wp_homing: 'Homing', wp_saw: 'Saws', h_wings: 'Wingmen', h_parts: 'Boss parts',
    rq_tap: 'Tap for next', rq_skip: 'Skip', rq_later: 'Later', rq_pick: 'Pick', rq_of: (a, b) => `${nf(a)} of ${nf(b)}`,
    rq_level: 'Level up!', rq_unlock: 'New journey', rq_hard: 'Hard tier', rq_badge: 'New badge', rq_mission: 'Mission done', rq_new: 'Something new for you', rq_girl: 'A new friend', rq_newSkin: 'New ship paint', rq_newSuit: 'New suit',
    cs_step1: 'Pilot', cs_step2: 'Suit', cs_step3: 'Ship', cs_free: 'Colours', cs_special: 'Special suits', cs_pickHint: 'Pick below, see it here',
    cs_next: 'Next', cs_done: 'Done', cs_nowWearing: 'Wearing it now', cs_nowShip: 'Your ship now',
    rb_shot: 'Shooter robot!', rb_dash: 'Charger robot!', rb_bomb: 'Bomber robot!', rb_sweep: 'Laser robot!', rb_shield: 'Shield robot!', rb_swarm: 'Swarm robot!',
    help_robots: 'From Venus on, rage robots appear. Each journey teaches one new move: shot, charge, bomb, laser, shield, swarm. When they rage they turn red and get faster.',
    help_robotsG: 'From Venus on, rage robots appear. Each journey teaches one new move: shot, charge, bomb, laser, shield, swarm. When they rage they turn red and get faster.',
    help_wings: 'Every robot you rescue becomes a wingman that flies with you, shoots, and blocks one hit for you.', help_wingsG: 'Every robot you rescue becomes a wingman that flies with you, shoots, and blocks one hit for you.',
    help_weapons: 'Shoot the supply drone for a capsule that changes colour: spread, laser, homing missiles or saws. The same weapon again makes it stronger (up to 3 dots); a hit costs one dot. Grey shots break, pink shots you dodge.',
    help_graze: 'A shot that passes close without touching you charges the Amal Beam. Bravery pays!', help_grazeG: 'A shot that passes close without touching you charges the Amal Beam. Bravery pays!',
    help_bigboss: 'Every boss has a trick: a shell that opens, bubbles that split, a hornet that loops, a magnet that wears scrap, a searchlight, hide-and-seek, a spinning shield, a scrap wall and a hammer. The guardians before it teach the trick, and Nabeeh tells you at the start. They watch you: stay in one spot and they aim there, hit them hard and they defend, and they remember what hit you last time. Each journey is one robot family: its small workers fly in the legs, a young one ends leg 1, a grown one ends leg 2, and the giant of the family waits at the end. The giant sends out its little ones and blasts areas.',
    help_mods: 'From Jupiter on, some legs have space weather: an ion storm, darkness, a magnetic field, or solar wind.',
    bot_teach_shot: ['Careful! This robot shoots where you are. Move!', 'See the glow on its gun? It is about to shoot!'], bot_teach_shotG: ['Careful! This robot shoots where you are. Move!', 'See the glow on its gun? It is about to shoot!'],
    bot_teach_dash: ['The orange arrows mean it will charge down that line. Get out of it!'], bot_teach_dashG: ['The orange arrows mean it will charge down that line. Get out of it!'],
    bot_teach_bomb: ['The red circle is where the bomb lands! Leave it before it blows!'], bot_teach_bombG: ['The red circle is where the bomb lands! Leave it before it blows!'],
    bot_teach_sweep: ['The laser sweeps from the first line to the second. Cross the other way!'], bot_teach_sweepG: ['The laser sweeps from the first line to the second. Cross the other way!'],
    bot_teach_shield: ['The blue robot protects its friends. Shoot it first!'], bot_teach_shieldG: ['The blue robot protects its friends. Shoot it first!'],
    bot_teach_swarm: ['It lets out little drones that chase you! Shoot them or outrun them!'], bot_teach_swarmG: ['It lets out little drones that chase you! Shoot them or outrun them!'],
    bot_rage: ['It is raging! Red and faster!', 'Careful, that one is angry!'], bot_rageG: ['It is raging! Red and faster!', 'Careful, that one is angry!'],
    bot_robots: ['Rage robots incoming!', 'A robot squad! Focus!'], bot_robotsG: ['Rage robots incoming!', 'A robot squad! Focus!'],
    bot_wing: ['The wingman saved you! Thanks, buddy!', 'We lost a wingman… but it saved you!'], bot_wingG: ['The wingman saved you! Thanks, buddy!', 'We lost a wingman… but it saved you!'],
    bot_weapon: ['A new weapon! Use it fast!', 'This weapon will not last long, go!'],
    bot_partDown: ['A part is down! Keep going!', 'One more part and it gets weaker!'],
    bot_coreOpen: ['The generator is down! The core is open, hit it now!'], bot_coreOpenG: ['The generator is down! The core is open, hit it now!'],
    bot_desp: ['Its last stand! Hold on!'], bot_despG: ['Its last stand! Hold on!'],

    help_fire: 'The blaster fires by itself all the time. Smash rocks and junk to score.',
    help_super: 'When the ring is full, press the Amal Beam button (or Space / X): a huge beam that destroys everything in front of you.',
    help_meteor: 'A red line and a "!" mean a meteor is coming! Only the Amal Beam can break it, so get out of its lane.',
    help_hull: 'Every hit costs 1 hull point, a meteor costs 2. If the hull runs out the mission fails, but you keep the dirhams you picked up.',
    help_shield: 'The shield (from Usta) blocks one hit, then recharges by itself.',
    help_coins: 'Rocks drop dirhams, and crystal rocks drop lots. Fuel tanks explode and break everything around them!',
    help_pickups: 'Look out for: repair kits (+1 hull), shield cells, power cells (+35% beam) and rapid fire.',
    help_hangar: 'Usta in the hangar upgrades the blaster, hull, shield, engine, magnet and Nabeeh. The ship grows cooler as you upgrade it.',
    help_nabeeh: 'Nabeeh flies next to you and warns you about meteors. Upgrade him and he fires a laser, and later vacuums up dirhams too.',
    help_legs: 'You can replay any leg you finished to collect more dirhams (35% of the reward).',
    help_keys: 'P or Esc: pause · M: sound',
    help_gates: 'From Venus on, each journey needs a ship level. Ship level = all your upgrade levels at Usta added together.',
    help_stars: 'Every leg has 3 stars: finish it, finish it with 60% hull or more, and reach the third-star score. New stars pay dirhams.',
    help_duels: 'The rogue ships meet you at the end of every journey. After Mars the arena opens: rematch any of them for free, and once a day the prize is ×2.',
    help_duelsG: 'The rogue ships meet you at the end of every journey. After Mars the arena opens: rematch any of them for free, and once a day the prize is ×2.',
    help_easy: 'The Moon is for the littlest pilots: nothing hurts, a hit is just a "bump!". Mars heals itself and brings you back if the ship goes down. From Venus on the hull is real.',
    help_easyG: 'The Moon is for the littlest pilots: nothing hurts, a hit is just a "bump!". Mars heals itself and brings you back if the ship goes down. From Venus on the hull is real.',
    help_bosses: 'Every leg ends with a robot: a small guardian on legs 1 and 2, the rogue ship on leg 3. When WARNING flashes, get the beam ready!',
    help_bossesG: 'Every leg ends with a robot: a small guardian on legs 1 and 2, the rogue ship on leg 3. When WARNING flashes, get the beam ready!',
    help_rescue: 'Rescue pods: lost maintenance robots. Fly over them to take them along. Rescue all three for a medal.',
    help_rescueG: 'Rescue pods: lost maintenance robots. Fly over them to take them along. Rescue all three for a medal.',
    help_medals: 'Each leg has 4 medals: finish, no damage, rescue all, and score. 12 medals in a journey open its Hard tier (rewards ×2).',
    help_ladder: 'Mission ladder: finish 3 missions to climb a level, earn dirhams and raise the multiplier on the dirhams you pick up (up to ×2.5).',
    help_boosters: "Usta's boosters last one flight: arm them above the Launch button.",
    help_mozah: "Finish 10 missions and Abood's sister Mozah arrives! She flies the same ship; pick her in Costumes.",
    // ---- rotate ----
    rotate: 'Turn your phone sideways!', rotate_hint: 'The ship needs room to fly',
    // ---- loader ----
    ld_fonts: 'Loading fonts…', ld_art: 'Drawing Abood, Nabeeh and the planets…', ld_artG: 'Drawing Mozah, Nabeeh and the planets…', ld_sound: 'Tuning the sounds…', ld_cache: 'Saving the game to play offline…', ld_ready: 'Ready!',
    tips: ['Tip: only the Amal Beam can break a meteor.', 'Tip: crystal rocks are full of dirhams.', 'Tip: fuel tanks explode and break what is around them.',
      'Tip: replay legs you finished to collect dirhams.', 'Tip: smash things one after another to raise the combo up to ×5.', 'Tip: the shield blocks a whole hit.',
      "Tip: finish today's missions for extra dirhams.", 'Tip: the Asteroid Belt is the best place to collect dirhams.',
      'Tip: the mission ladder multiplies the dirhams you pick up.', 'Tip: your first duel win each day pays ×2.'],
    // ---- update toast ----
    update: 'A new version of the game is ready', updateBtn: 'Update',
    // ---- language picker ----
    pickTitle: 'Choose your language', pickHint: 'You can change it later with the flag at the top.', lang_ar: 'العربية', lang_en: 'English',
    // ---- misc ----
    ios: 'To play fullscreen: tap the Share button, then "Add to Home Screen".', sound: 'Sound and music', pause: 'Pause', fullscreen: 'Fullscreen',
    // ---- hangar ----
    hg_title: "Usta's hangar", hg_note: 'Every upgrade makes the ship stronger. The best place to spend your dirhams.', hg_tier: n => `Ship look ${nf(n)} of 4`,
    hg_tabUp: 'Upgrades', hg_tabBoost: 'Boosters',
    up_blaster: 'Blaster', up_blaster_d: 'Harder hits, faster shots',
    up_blaster_v: v => `Damage ${nf(v.dmg)} · ${nf(v.fireRate)} shots/s${v.pierce ? ' · ✦ bolts pierce a small rock' : ''}`,
    up_spread: 'Twin guns', up_spread_d: 'More bolts per shot, in a fan',
    up_spread_v: v => `${nf(v.guns)} ${v.guns === 1 ? 'bolt' : 'bolts'} per shot`,
    up_hull: 'Hull armour', up_hull_d: 'More hull points to take more hits',
    up_hull_v: v => `${nf(v.maxHp)} hull points${v.regen ? ` · ✦ repairs 1 point after ${nf(v.regen)}s without a hit` : ''}`,
    up_shield: 'Shield', up_shield_d: 'A bubble that blocks one hit, then recharges',
    up_shield_v: v => v.shieldCd ? `Recharges in ${nf(v.shieldCd)}s${v.shieldBlast ? ' · ✦ a pop smashes small rocks nearby' : ''}` : 'No shield',
    up_super: 'Super core', up_super_d: 'The Amal Beam charges faster and lasts longer',
    up_super_v: v => `${nf(v.superDur)}s · charge ×${nf(v.superGain)}${v.superPassive ? ' · self-charging' : ''}`,
    up_engine: 'Engine', up_engine_d: 'The ship follows your finger faster',
    up_engine_v: v => `Response ${nf(pct(v.follow / 9))}%${v.nearMiss ? ' · ✦ close meteor dodges charge the beam' : ''}`,
    up_magnet: 'Magnet', up_magnet_d: 'Pulls dirhams toward you',
    up_magnet_v: v => v.magnet ? `Range ${nf(v.magnet)}${v.pullPickups ? ' · ✦ pulls power-ups too' : ''}` : 'No magnet',
    up_nabeeh: 'Nabeeh AI', up_nabeeh_d: 'Nabeeh fires a laser at rocks, and from level 3 vacuums up dirhams',
    up_nabeeh_v: v => v.rate ? `Laser ${nf(v.rate)}/s · damage ${nf(v.dmg)}${v.warnPlus ? ' · ✦ earlier warnings' : ''}${v.vacuum ? ' · vacuums dirhams' : ''}${v.intercept ? ' · ✦ blocks mines in duels' : ''}${v.double ? ' · double laser' : ''}` : 'Flies with you and warns you',
    up_lv: (k, n) => `Level ${nf(k)} of ${nf(n)}`, up_max: 'Max level ✓', up_buy: n => `Upgrade · AED ${nf(n)}`, up_next: 'Next', up_now: 'Now',
    up_rec: 'Usta recommends', up_trick: name => `✦ New trick: ${name}`,
    tr_pierce: 'Piercing bolts', tr_regen: 'Self-repair', tr_shieldBlast: 'Shield blast', tr_nearMiss: 'Close-call charge', tr_pullPickups: 'Power-up pull',
    tr_warn: 'Earlier warnings', tr_intercept: 'Mine blocker', tr_double: 'Double laser',
    bought: 'Done!', notEnough: 'Not enough dirhams', shopNote: 'In-game dirhams only. No real payments.',
    usta_tip: name => `Usta: your ship is getting strong… try the ${name}!`,
    // ---- boosters ----
    bo_title: 'Boosters', bo_shield: 'Extra shield', bo_shield_d: 'Start the flight with an extra shield charge', bo_super: 'Beam ready', bo_super_d: 'The Amal Beam starts full',
    bo_hull: 'Extra hull', bo_hull_d: '+1 hull point for this flight', bo_coins: 'Dirham boost', bo_coins_d: '+0.5 to the coin multiplier for this flight',
    bo_have: n => `You have ${nf(n)}`, bo_arm: 'Use', bo_none: 'No boosters yet. Buy them in Usta’s hangar.', bo_used: 'Boosters on!',
    // ---- characters ----
    ch_abood: 'Abood', ch_mozah: 'Mozah', ch_title: 'Who is flying?', ch_pick: 'Pick', ch_playing: 'Flying now',
    ch_lock: (n, g) => `Finish ${nf(g)} missions to unlock · ${nf(n)} of ${nf(g)}`,
    girlNew: 'Mozah arrived at Falak Station! Pick her in Costumes',
    // ---- costumes ----
    cs_title: 'Costumes', cs_note: 'Colours are free. Special costumes have a small perk: buy one once and wear it as Abood or Mozah.',
    cs_colors: 'Colours', cs_perks: 'Perk costumes', cs_skins: 'Ship paint',
    cs_white: 'White', cs_blue: 'Sky blue', cs_sand: 'Sand', cs_teal: 'Dark teal',
    cs_lilac: 'Lilac', cs_rose: 'Rose', cs_mint: 'Mint', cs_plum: 'Dark plum',
    cs_heat: 'Heat suit', cs_pilot: 'Pilot suit', cs_link: 'Link suit', cs_hope: 'Hope suit', cs_gold: 'Gold suit', cs_rover: 'Rover suit',
    cs_magnet: 'Magnet suit', cs_comet: 'Comet suit', cs_crystal: 'Crystal suit', cs_champ: 'Champion suit', cs_ice: 'Ice suit', cs_star: 'Star suit',
    cp_heat: '+1 hull point', cp_pilot: 'The Amal Beam starts 30% charged', cp_link: "Nabeeh's laser 25% faster", cp_hope: 'The Amal Beam lasts 0.4s longer',
    cp_gold: 'Coin multiplier +0.2', cp_rover: 'Repair kits show up twice as often', cp_magnet: 'Magnet reaches 40 further (even without the upgrade)',
    cp_comet: 'A faster, lighter ship', cp_crystal: 'More crystals, and +1 dirham from every crystal rock', cp_champ: 'Blaster damage +10%',
    cp_ice: 'Meteor and laser warnings 0.3s longer', cp_star: 'Longer combo window (1.5s)',
    cs_linkNote: 'Needs Nabeeh AI level 1', cs_src_coins: "From Usta for dirhams", cs_src_badge: name => `Unlocked by the badge: ${name}`,
    cs_src_rival: name => `Fix ${name} in the Duels`, cs_src_ladder: n => `Reach level ${nf(n)} on the mission ladder`,
    cs_src_stars: (a, b) => `Collect ${nf(b)} stars · ${nf(a)} of ${nf(b)}`,
    sk_falak: 'Falak (original)', sk_patch: 'Patchwork', sk_hornet: 'Hornet', sk_radar: 'Radar', sk_whirl: 'Whirl', sk_anvil: 'Anvil', sk_royal: 'Royal',
    paint: 'Paint the ship',
    // ---- suits (v1 names, kept) ----
    st_title: 'Costumes', st_note: 'All colours are free. You only pay for suits with a perk.',
    suit_white: 'White', suit_blue: 'Sky blue', suit_sand: 'Sand', suit_teal: 'Dark teal', suit_heat: 'Heat suit', suit_pilot: 'Pilot suit', suit_gold: 'Gold suit',
    perk_heat: '+1 hull point', perk_pilot: 'The Amal Beam starts 30% charged', perk_gold: 'Coin multiplier +0.2 · from the Saturn badge',
    free: 'Free', wear: 'Wear', wearing: 'Wearing', badgeOnly: 'Unlocked by a badge', buy: n => `Buy · AED ${nf(n)}`, owned: 'Owned',
    // ---- missions (ms_<kind> added below) ----
    ms_title: 'Missions', ms_daily: "Today's missions", ms_note: 'New ones every day. Claim the rewards here.', ms_bonus: n => `Finish all three today: +AED ${nf(n)} extra`,
    ms_prog: (a, b) => `${nf(a)} / ${nf(b)}`, ms_done: 'Done ✓', claim: 'Claim', claimed: 'Claimed ✓',
    // ---- mission ladder (lm_<kind> added below) ----
    ld_title: n => `Mission ladder · level ${nf(n)}`, ld_mult: m => `Dirhams ×${nf(m)}`,
    ld_note: (m, nx, r) => `Finish all three for AED ${nf(r)}, and the dirhams you pick up become ×${nf(nx)} instead of ×${nf(m)}.`,
    ld_skip: n => `Swap · AED ${nf(n)}`, ld_wait: 'New missions count from your next flight',
    ld_up: (lv, m, r) => `Level ${nf(lv)}! Dirhams ×${nf(m)} · +AED ${nf(r)}`,
    // ---- stars ----
    st_1: 'Finish the leg', st_2: p => `Hull ${pctOf(p)}% or more`, st_3: n => `Score ${nf(n)}`,
    rv_g_moon_a: 'Bolty', rv_g_moon_a_taunt: ['You shall not pass!', 'I guard the Moon!'], rv_g_moon_a_fixed: 'Thanks! I like the Moon even more now.',
    rv_g_moon_b: 'Nutty', rv_g_moon_b_taunt: ['The Moon is mine!', 'Go back to your station!'], rv_g_moon_b_fixed: 'My eye is blue! Nice!',
    rv_g_mars_a: 'Dusty', rv_g_mars_a_taunt: ['Mars dust will cover you!', 'I do not like visitors!'], rv_g_mars_a_fixed: 'You cleaned the dust off me! Thanks.',
    rv_g_mars_b: 'Rusty', rv_g_mars_b_taunt: ['Rusty and proud!', 'Mars is red like my eye!'], rv_g_mars_b_fixed: 'I feel brand new!',
    rv_g_venus_a: 'Sparky', rv_g_venus_a_taunt: ['Bzzz! It is hot here!', 'My sparks burn!'], rv_g_venus_a_fixed: 'Bzzz… but friendly.',
    rv_g_venus_b: 'Stinger', rv_g_venus_b_taunt: ['Bzzzz! I am bigger than Sparky!', 'Nobody passes Venus!'], rv_g_venus_b_fixed: 'Bzz… fine, no more stinging.',
    rv_g_belt_a: 'Pebble', rv_g_belt_a_taunt: ['The Belt is my home!', 'My plates block everything!'], rv_g_belt_a_fixed: 'I will let the rocks pass in peace.',
    rv_g_belt_b: 'Clamp', rv_g_belt_b_taunt: ['All the iron is mine!', 'I pull it in and I throw it!'], rv_g_belt_b_fixed: 'I will collect junk instead of throwing it!',
    rv_g_jupiter_a: 'Blip', rv_g_jupiter_a_taunt: ['I see you on the radar!', 'My laser never misses!'], rv_g_jupiter_a_fixed: 'A rescue radar from now on!',
    rv_g_jupiter_b: 'Ping', rv_g_jupiter_b_taunt: ['Beep beep! I see you!', 'My light never misses!'], rv_g_jupiter_b_fixed: 'Beep… friend!',
    rv_g_saturn_a: 'Shadow', rv_g_saturn_a_taunt: ['Where am I? Here… no, there!', 'You cannot see me!'], rv_g_saturn_a_fixed: 'No more hiding from friends.',
    rv_g_saturn_b: 'Blink', rv_g_saturn_b_taunt: ['Where am I? Guess!', 'One blink and I am gone!'], rv_g_saturn_b_fixed: 'Fine, no more hiding.',
    rv_g_uranus_a: 'Spinner', rv_g_uranus_a_taunt: ['Spin spin spin!', 'Get dizzy with me!'], rv_g_uranus_a_fixed: 'I stopped spinning… a bit.',
    rv_g_uranus_b: 'Twister', rv_g_uranus_b_taunt: ['My shield never stops spinning!', 'Make me dizzy if you can!'], rv_g_uranus_b_fixed: 'The spinning stopped… that feels nice.',
    // ---- duels ----
    du_title: 'Rogue ship duels', du_note: 'The rogue ships meet you at the end of every journey. Here you can rematch any of them for free, and once a day the prize is ×2!',

    du_lock: 'Reach Mars to open the Duels', du_lockNext: name => `Opens after: ${name}`, du_fight: 'Fight!', du_rematch: 'Rematch', b_rematch: 'Rematch', du_time: 'Time',
    du_par: s => `Third star: under ${nf(s)}s`, du_diff: 'Difficulty', du_reward: n => `Reward AED ${nf(n)}`, du_unlock: 'Unlocks:',
    du_day: 'Duel of the day ×2', du_best: s => `Best time: ${nf(s)}s`, du_win: 'Robot fixed!', du_lose: 'The robot won this time', du_fixedTitle: name => `${name} is a friend now!`,
    rv_khurda: 'Scrappy', rv_khurda_t: 'The wobbly drone', rv_khurda_d: 'An old fuel tank with a red eye and a satellite dish for a hat. Loves to show off… and sneezes a lot.',
    rv_khurda_taunt: ["I'm the strongest ship in orbit! …achoo!", 'Look at my iron muscles! …achoo!', 'Nobody can beat me! …ah-choo!', 'This orbit is MY orbit!'],
    rv_khurda_fixed: 'Thanks! I feel clean inside!',
    rv_bubolt: 'Captain Bolt', rv_bubolt_t: 'The bolt pirate', rv_bubolt_d: 'A rusty drone with a lens over one eye, a wrench for an arm and a flag of bolts.',
    rv_bubolt_taunt: ['Hand over the dirhams, space sailor!', 'Every bolt in space is mine!', 'Raise the sails… I mean the engines!', 'Har har! Your ship will be scrap!'],
    rv_bubolt_fixed: "Heh, I'm a good pirate now.",
    rv_zannana: 'Buzzy', rv_zannana_t: 'The speedy hornet', rv_zannana_d: 'The smallest and fastest robot, yellow and black, with wings that never stop buzzing.',
    rv_zannana_taunt: ["Bzzzz! Can't catch me!", 'Here! No, here! Bzzzz!', 'Faster than lightning! Bzz!', 'Bzzzz… dizzy yet?'],
    rv_zannana_fixed: 'Bzz… thank you… bzz.',
    rv_magna: 'Magna', rv_magna_t: 'The junk magnet', rv_magna_d: "A horseshoe-magnet ship guarded by old solar panels. Don't let her pull your dirhams away!",
    rv_magna_taunt: ['All coins come to me, magnet law!', 'Your dirhams? You mean MY dirhams!', 'Come closer… I attract everything!', 'My panels protect me. Try it!'],
    rv_magna_fixed: 'Take your dirhams… sorry.',
    rv_radar: 'Radar', rv_radar_t: 'The seeing eye', rv_radar_d: 'A white spinning dish head that fires a laser from its centre. Watch the red line and get out of it!',
    rv_radar_taunt: ['Target found. Target found.', 'Aiming… beep.', 'Target in lane. Beep beep.', 'No escape. Radar sees you.'],
    rv_radar_fixed: 'Detected… a new friend.',
    rv_ghummaid: 'Peekaboo', rv_ghummaid_t: 'Hide-and-seek champ', rv_ghummaid_d: 'A purple robot that vanishes and pops up somewhere else. The dotted outline shows where!',
    rv_ghummaid_taunt: ['Where am I? Here! No, here!', "Saw me? No you didn't!", 'One… two… three… peekaboo!', 'Hehe, come find me!'],
    rv_ghummaid_fixed: "OK, let's play hide-and-seek without rockets.",
    rv_dawwama: 'Whirly', rv_dawwama_t: 'The spinner', rv_dawwama_d: 'A spinning-top ship that whirls out spirals of shots. Look for the gap!',
    rv_dawwama_taunt: ['Spin spin spin… dizzy? Not me!', 'The world spins, and I spin faster!', 'Round and round and round!', 'Wheee! Spin with me!'],
    rv_dawwama_fixed: 'I finally stopped… phew.',
    rv_kabeer: 'Scrap King', rv_kabeer_t: 'King of the scrapyard', rv_kabeer_d: 'A huge mothership patched from old satellites, with a crown of bent antennas and a hatch full of junk. Blow his fuel tanks up near him!',
    rv_kabeer_taunt: ['All space junk is mine!', 'Bow before the king!', 'I have enough junk for a hundred years!', 'Take this… and this… and this!'],
    rv_kabeer_fixed: 'My kingdom will be a recycling yard!',
    rv_sindan: 'Anvil', rv_sindan_t: 'The iron fort', rv_sindan_d: 'Heavy iron armour, gold rivets and a big shield in front. Break the shield and it gets dizzy for a moment!',
    rv_sindan_taunt: ['Nothing gets through my armour.', 'I… am… heavy. I do not move.', 'Your shots tickle.', 'Iron does not break.'],
    rv_sindan_fixed: 'My shield protects you now.',
    rv_sifr: 'Zero', rv_sifr_t: 'The lost AI', rv_sifr_d: 'A sleek black ship with red lines and a ring eye: an old AI from an abandoned station, and the toughest of them all.',
    rv_sifr_taunt: ["I've been alone so long… go away!", 'Nobody visits me… why are you here?', 'The station is empty… and so am I.', "Go away! …don't leave."],
    rv_sifr_fixed: 'A friend? …first time I hear that.', rv_sifr_bot: "Zero wasn't bad, just lonely.",
    // ---- login ----
    lg_title: 'Daily login gift', lg_day: n => `Day ${nf(n)}`, lg_claim: n => `Claim AED ${nf(n)}`, lg_done: "You got today's gift. Come back tomorrow!", lg_streak: n => `${nf(n)} days in a row`,
    lg_booster: '+ a free shield booster', lg_welcome: 'Welcome-back gift: a ready-beam booster',
    // ---- badges ----
    bg_title: 'Badges', bg_tiered: 'Each badge has 3 tiers: bronze, then silver, then gold. Every tier is a bigger goal with a bigger reward.',
    bg_count: (a, b) => `${nf(a)} of ${nf(b)}`, bg_locked: 'Locked', bg_reward: n => `+AED ${nf(n)}`, bg_prog: (a, b) => `${nf(a)} of ${nf(b)}`,
    tier_0: 'Bronze', tier_1: 'Silver', tier_2: 'Gold', tier_none: 'Not started yet', tier_all: 'All tiers ✓',
    bg_first: 'First flight', bg_first_d: 'Fly out of Falak Station for the first time',
    bg_hangar: "Usta's customer", bg_hangar_d: 'Buy your first upgrade in the hangar',
    bg_moon: 'Moon reached!', bg_moon_d: 'Finish the journey to the Moon',
    bg_mars: 'The red planet', bg_mars_d: 'Finish the journey to Mars',
    bg_saturn: 'Lord of the rings', bg_saturnG: 'Lady of the rings', bg_saturn_d: 'Finish the journey to Saturn to unlock the gold suit',
    bg_tour: 'Grand tour', bg_tour_d: 'Reach Neptune, the last planet! It unlocks the royal paint',
    bg_duel1: 'First fix', bg_duel1_d: 'Fix your first rogue robot in the Duels',
    bg_champion: 'Duel champion', bg_champion_d: 'Fix Zero, the last rogue robot',
    bg_stars24: '24 stars', bg_stars24_d: 'Collect 24 leg stars',
    bg_stars48: '48 stars', bg_stars48_d: 'Collect 48 leg stars to unlock the Star suit',
    bg_stars72: 'Every star', bg_stars72_d: 'Collect all 72 leg stars',
    bg_mozah: 'Mozah in space', bg_mozah_d: 'Fly once as Mozah', bg_mozah_dG: 'Fly your first flight, Mozah',
    bc_rocks: 'Rock smasher', bc_rocks_d: g => `Destroy ${nf(g)} rocks and junk`,
    bc_meteors: 'Meteor dodger', bc_meteors_d: g => `Dodge ${nf(g)} meteors`,
    bc_coins: 'Dirham collector', bc_coins_d: g => `Pick up AED ${nf(g)} in flight`,
    bc_supers: 'Amal Beam', bc_supers_d: g => `Use the beam ${nf(g)} times`,
    bc_legs: 'Frequent flyer', bc_legs_d: g => `Finish ${nf(g)} legs`,
    bc_planets: 'Explorer', bc_planets_d: g => `Reach a planet ${nf(g)} times`,
    bc_nohit: 'Not a scratch', bc_nohit_d: g => `Finish ${nf(g)} legs without a hit`,
    bc_crystals: 'Crystal hunter', bc_crystals_d: g => `Smash ${nf(g)} crystal rocks`,
    bc_chains: 'Blast expert', bc_chains_d: g => `Destroy ${nf(g)} things with fuel-tank blasts`,
    bc_duels: 'Robot fixer', bc_duels_d: g => `Win ${nf(g)} duels`,
    bc_ladder: 'Ladder climber', bc_ladder_d: g => `Reach level ${nf(g)} on the mission ladder`,
    bc_loyal: 'Loyal flyer', bc_loyal_d: g => `Play ${nf(g)} days in a row`,
    // ---- robots: Nabeeh (cheeky, smart) ----
    bot_start: ['Buckle up, Abood!', 'All systems OK… mostly.', 'Ready, captain? I was ready yesterday!', 'I checked the route 100 times. It looks good.',
      "Bismillah, here we go!", "Remember: rocks don't say sorry.", 'Mama on the radio says: don’t be late for dinner!', 'Radar on. Air conditioning too.'],
    bot_startG: ['Buckle up, Mozah!', 'Ready, captain? I was ready yesterday!', 'Abood on the radio: careful with my ship! Haha', 'Mama on the radio says: don’t be late for dinner!',
      "Bismillah, here we go!", "Remember: rocks don't say sorry.", 'All systems OK… mostly.', 'Radar on. Air conditioning too.'],
    bot_hit: ['Ouch! That hit the wing!', "Careful! The ship isn't a bumper car!", "No worries, Usta will fix it.", 'Rude rock!', 'Oof! I felt that in my circuits.',
      'Easy, easy, the hull has feelings!', 'Focus, captain!', "That rock didn't see the signal."],
    bot_meteor: ["Meteor! Go up or down, just don't stop!", 'Watch out! A meteor coming at rocket speed!', 'Something on fire is coming! Move!', 'Meteor! Only the beam can break it!',
      "That's not a rock, that's flying fire!", 'Red line means stay away!'],
    bot_super: ['Amal Beam ready! Press the big button!', 'Go on! Show them the Amal Beam!', 'Fully charged! Let it shine!', 'Woah! Look at the rocks melt!',
      'That beam is brighter than a summer noon!', 'You lit up all of space!'],
    bot_combo: ["Combo! You're on fire!", 'One after another! Keep going!', 'Bravo, Abood!', "Even I can't count that fast!", "That's pro flying!",
      'Keep going, the dirhams love you!', 'My circuits are dancing!'],
    bot_comboG: ["Combo! You're on fire!", 'One after another! Keep going!', 'Bravo, Mozah!', "Even I can't count that fast!", "That's pro flying!",
      'Keep going, the dirhams love you!', 'My circuits are dancing!'],
    bot_lowhp: ['Hull is weak! Find a repair kit!', 'Warning: the ship looks like a squashed juice box.', 'A bit more and we become spare parts! Careful!',
      'Stay away from the rocks now!', "It's serious… but I believe in you!", 'If Mama saw us now she would be so cross!'],
    bot_win: ["Leg done! I'm proud of you!", 'Woohoo! Made it in one piece!', 'Yes! Usta will love these dirhams.', 'Well done, captain! We earned a break.',
      'Saved to my memory: Abood is a hero!', "Great trip! Just don't tell the rocks."],
    bot_winG: ["Leg done! I'm proud of you!", 'Woohoo! Made it in one piece!', 'Yes! Usta will love these dirhams.', 'Well done, captain! We earned a break.',
      'Saved to my memory: Mozah is a hero!', 'Abood will be jealous when he hears, haha.', "Great trip! Just don't tell the rocks."],
    bot_lose: ['No worries, every astronaut crashes once!', 'The ship broke… but we kept the dirhams!', "Let's go back to Usta and upgrade the ship.",
      "Next time we'll make it! I'm 99% sure.", "Don't be sad, even the Moon disappears and comes back every month!", 'Friendly advice: upgrade the shield.'],
    bot_menu: ['Did you know? Only the Amal Beam can break a meteor.', 'Crystal rocks are full of dirhams!', 'Fuel tanks explode and break what is around them.',
      'Replay legs to collect more dirhams.', 'Usta can fit me with a laser… if you pay!', "Finish today's missions for extra dirhams.",
      'I am Nabeeh, and today I feel extra clever.', 'The Moon is waiting for us. So is the coffee.', 'Mama called to ask: did you eat? I said: soon!'],
    bot_menuG: ['Did you know? Only the Amal Beam can break a meteor.', 'Crystal rocks are full of dirhams!', 'Fuel tanks explode and break what is around them.',
      'Replay legs to collect more dirhams.', 'Usta can fit me with a laser… if you pay!', "Finish today's missions for extra dirhams.",
      "Abood says you fly better than him… don't tell him I told you!", 'I am Nabeeh, and today I feel extra clever.', 'Mama called to ask: did you eat? I said: soon!'],
    bot_arrive: ['Look! The planet is right there!', "We're in orbit! Take a photo!", "Abood's dream came true!", 'A new postcard for the collection!'],
    bot_arriveG: ['Look! The planet is right there!', "We're in orbit! Take a photo!", "Mozah's dream came true!", 'A new postcard for the collection!'],
    bot_shield: ['The shield blocked it!', 'Shield is on, no worries!', 'My bubble saved you!'],
    bot_pickup: ['Nice! Grab it!', "That'll help!", 'A gift from space!'],
    bot_duel: ["This robot is lost. Let's fix it!", 'Aim for the red eye!', 'Knock out its power and I will reprogram it!', "Don't worry, rogue robots just need a friend."],
    bot_duelG: ["This robot is lost. Let's fix it!", 'Aim for the red eye, Mozah!', 'Knock out its power and I will reprogram it!', "Don't worry, rogue robots just need a friend."],
    bot_duelWin: ['Reprogrammed! Its eye turned blue!', 'A new friend for Falak Station!', 'Clean work, captain!', 'It said thank you… in beep-boop.'],
    bot_duelLose: ['No worries, that robot is tough. Upgrade the blaster and come back!', "Next time we'll fix it, for sure!", 'Try upgrading the shield and hull at Usta’s.', 'Saw its moves? Now we know them!'],
    bot_welcome: ['We missed you! Here is a ready beam as a gift.', 'Welcome back! The station was so quiet without you.', 'You came back! Usta left you a gift.'],
    bot_bump: ['Oops! Nothing happened, keep going!', 'Bump! The ship is strong, no worries.', 'Haha, a joking rock!', 'No problem, fly on!'],
    bot_bumpG: ['Oops! Nothing happened, keep going!', 'Bump! The ship is strong, no worries.', 'Haha, a joking rock!', 'No problem, fly on!'],
    bot_respawn: ['We are back! Fresh shield!', 'No problem, the ship fixes itself!', 'Again! I am with you!'],
    bot_respawnG: ['We are back! Fresh shield!', 'No problem, the ship fixes itself!', 'Again! I am with you!'],
    bot_boss: ['WARNING! The rogue ship is coming!', 'The big one! Get the Amal Beam ready!', 'Focus, captain, the big fight!'],
    bot_bossG: ['WARNING! The rogue ship is coming!', 'The big one! Get the Amal Beam ready!', 'Focus, captain, the big fight!'],
    bot_guardian: ['A guard robot ahead! Knock out its power!', 'A little guard, you can take it!', 'Look! The guardian of this leg!'],
    bot_guardianG: ['A guard robot ahead! Knock out its power!', 'A little guard, you can take it!', 'Look! The guardian of this leg!'],
    bot_rescue: ['Robot rescued! It said thanks in beep-boop.', 'A lost maintenance robot… fly over it!', 'A rescue pod! Take it with us!'],
    bot_rescueG: ['Robot rescued! It said thanks in beep-boop.', 'A lost maintenance robot… fly over it!', 'A rescue pod! Take it with us!'],
    bot_grabbed: ['Heeey! Let me go! Shoot the grabber!', 'Abood! The grabber has me!'], bot_grabbedG: ['Heeey! Let me go! Shoot the grabber!', 'Mozah! The grabber has me!'],
    bot_freed: ['Thanks! I am free again!', 'Phew, free! Let us go on.'],
    bot_flare: ['Solar flare! Hide behind a big rock!', 'The Sun is angry! Find a rock to shelter you!'], bot_flareG: ['Solar flare! Hide behind a big rock!', 'The Sun is angry! Find a rock to shelter you!'],
    bot_corridor: ['A derelict station! Steer between the walls!', 'Careful, the passage is narrow!'], bot_corridorG: ['A derelict station! Steer between the walls!', 'Careful, the passage is narrow!'],
    // ---- robots: Usta (hangar) ----
    usta_lines: ['Welcome, captain! What shall we fit today?', 'Your blaster needs an upgrade, trust me.', 'This ship is like a son to me.', 'Every bolt here has a story.',
      'The shield protects you, and the shield needs dirhams.', 'Nabeeh wants a laser? Tell him to say please.', 'My wrench is ready. Are you?', "Don't forget: a good engine helps you dodge meteors."],
    usta_linesG: ['Welcome, Captain Mozah! What shall we fit today?', 'Trust me, the blaster needs an upgrade.', "Your brother broke the wing yesterday… don't do what he did!", 'My wrench is ready. Are you?',
      'The shield protects you, and the shield needs dirhams.', 'Nabeeh wants a laser? Tell him to say please.', 'This ship is like family to me.', "Don't forget: a good engine helps you dodge meteors."],
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
// mission texts: ms_<kind> (daily and results) and lm_<kind> (ladder) for every kind, Mozah's Arabic as the G version
for (const [kind, [m, f, e]] of Object.entries(MS)) {
  for (const p of ['ms_', 'lm_']) {
    if (p === 'lm_' && kind === 'runRocks') continue;          // v1 daily kind only
    STR.ar[p + kind] = m; STR.ar[p + kind + 'G'] = f; STR.en[p + kind] = e;
  }
}
// v1 suit names for every costume (the old suits sheet reads suit_<id>)
for (const L of ['ar', 'en']) for (const k of Object.keys(STR[L])) if (k.startsWith('cs_') && !k.includes('_src') && !(('suit_' + k.slice(3)) in STR[L]) &&
  !['cs_title', 'cs_note', 'cs_noteG', 'cs_colors', 'cs_perks', 'cs_skins', 'cs_linkNote'].includes(k)) STR[L]['suit_' + k.slice(3)] = STR[L][k];
// English needs a G version only where Abood's name appears; the rest point at the plain text so both tables keep the
// same key set (T() with the girl flag on then returns the same English either way).
for (const k of Object.keys(STR.ar)) if (k.endsWith('G') && STR.ar[k.slice(0, -1)] !== undefined && !(k in STR.en)) STR.en[k] = STR.en[k.slice(0, -1)];
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
// While Mozah is playing, T() prefers a key's girl version (key + 'G') when there is one.
let girl = false;
try { girl = char() === 'mozah'; } catch (e) { girl = false; }
export function setGirl(b) { girl = !!b; }
export const isGirl = () => girl;

export const lang = () => cur;
export const getLang = lang;
export const dir = () => cur === 'ar' ? 'rtl' : 'ltr';
export const hasPickedLang = () => !!readStored() || !!settings().picked;
export const hasStoredLang = hasPickedLang;
export function onLang(fn) { listeners.push(fn); }

const look = key => (girl ? STR[cur][key + 'G'] : undefined) ?? STR[cur][key] ?? (girl ? STR.en[key + 'G'] : undefined) ?? STR.en[key];
export function T(key, ...args) {
  const v = look(key) ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
const lastLine = {};
export function TL(key) {
  const v = look(key);
  if (!Array.isArray(v)) return typeof v === 'function' ? v() : (v ?? key);
  if (v.length < 2) return v[0] ?? '';
  const mk = key + (girl ? 'G' : '');
  let i = Math.floor(Math.random() * v.length);
  if (i === lastLine[mk]) i = (i + 1 + Math.floor(Math.random() * (v.length - 1))) % v.length;
  lastLine[mk] = i;
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
