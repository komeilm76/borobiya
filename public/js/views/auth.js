/** Authentication, registration, recovery and onboarding views. */
import { escapeHtml, icon, numberFa, cycleTheme, toast, rerender, go } from '../ui.js';
import { get, post, errorMessage } from '../api.js';

/** @param {any} state */
export async function ensureCatalog(state) {
  if (state.securityQuestions?.length) return state.securityQuestions;
  const result = await get('/_public/security-questions');
  state.securityQuestions = result.items || [];
  return state.securityQuestions;
}

function authChrome() {
  return `<header class="auth-chrome">
    <div class="auth-chrome__brand">
      <span class="brand-word">بورو بیا</span>
      <button class="chrome-plus" type="button" data-action="noop" aria-label="درباره بورو بیا">${icon('plus')}</button>
    </div>
    <div class="auth-chrome__tools">
      <button class="chrome-pill" type="button" data-go="/_auth/login">${icon('arrow-left', 'chrome-pill__arrow')}<span>صفحه اصلی</span></button>
      <button class="chrome-round" type="button" data-action="theme" aria-label="تغییر تم">${icon('theme-light-dark')}</button>
    </div>
  </header>`;
}

/** @param {string} kind */
function authIntro(kind) {
  const copy = {
    login: {
      badge: 'ورود امن به بورو بیا',
      lines: ['با هم،', 'آمادهتر', 'هستیم.'],
      body: 'وارد حساب خود شوید تا با همراهانتان در ارتباط بمانید و در زمان نیاز، سریعتر به کمک برسید.',
      footTitle: 'حساب شما امن میماند',
      footBody: 'اطلاعات ورود شما محرمانه میماند.'
    },
    register: {
      badge: 'یک قدم تا همراهی',
      lines: ['حسابی امن،', 'همراهی', 'نزدیک.'],
      body: 'با ساخت حساب به شبکهای از همراهان محلی میپیوندید. پرسشها را طوری انتخاب کنید که پاسخشان را بهخاطر بسپارید.',
      footTitle: 'پاسخها محرمانه میمانند',
      footBody: 'پنج پرسش متفاوت، امنیت حساب شما را تضمین میکند.'
    },
    recovery: {
      badge: 'بازیابی دسترسی',
      lines: ['دسترسی امن،', 'دوباره', 'نزدیک.'],
      body: 'نام کاربری، سه پاسخ امنیتی و گذرواژه تازه، تنها چیزهایی هستند که برای بازگشت به حساب لازماند.',
      footTitle: 'بدون افشای اطلاعات',
      footBody: 'پاسخهای درست بدون نمایش دادههای حساب بررسی میشوند.'
    },
    onboarding: {
      badge: 'تکمیل حساب',
      lines: ['پنج پاسخ،', 'امنیت', 'بیشتر.'],
      body: 'پنج پرسش امنیتی انتخاب کنید و پاسخ آنها را فقط برای خودتان نگه دارید. این پاسخها راه بازیابی حساب شما هستند.',
      footTitle: 'یک بار، برای همیشه',
      footBody: 'پس از ذخیره، وارد نقشه و همراهان خود شوید.'
    }
  }[kind] || {
    badge: 'بورو بیا', lines: ['با هم،', 'آمادهتر', 'هستیم.'], body: '', footTitle: '', footBody: ''
  };
  return `<aside class="auth-intro">
    <div class="intro-badge">${icon('circle-medium', 'intro-badge__dot')}<span>${escapeHtml(copy.badge)}</span></div>
    <div class="intro-copy">
      <h2>${escapeHtml(copy.lines[0])}<br><em>${escapeHtml(copy.lines[1])}</em><br>${escapeHtml(copy.lines[2])}</h2>
      <p>${escapeHtml(copy.body)}</p>
    </div>
    <div class="radar" aria-hidden="true">
      <span class="radar__ring radar__ring--outer"></span>
      <span class="radar__ring radar__ring--inner"></span>
      <span class="radar__dot radar__dot--amber"></span>
      <span class="radar__dot radar__dot--mint"></span>
      <span class="radar__plus">${icon('plus')}</span>
    </div>
    ${kind === 'register' ? `<div class="intro-notes">
      <div><bdi>۰۱</bdi><span>پاسخها بهصورت خلاصهشده ذخیره میشوند.</span></div>
      <div><bdi>۰۲</bdi><span>پنج پاسخ متفاوت، بازیابی را امن میکند.</span></div>
    </div>` : ''}
    <div class="intro-shield">${icon('shield-check-outline')}<div><strong>${escapeHtml(copy.footTitle)}</strong><span>${escapeHtml(copy.footBody)}</span></div></div>
  </aside>`;
}

/** @param {string} id @param {string} label @param {string} type @param {string} placeholder @param {string} iconName @param {string} [extra] */
function field(id, label, type, placeholder, iconName, extra = '') {
  return `<label class="field" for="${id}">
    <span class="field__label">${escapeHtml(label)}</span>
    <input id="${id}" name="${id}" type="${type}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" ${extra}>
    <span class="field__icon">${icon(iconName)}</span>
  </label>`;
}

/** @param {string} id @param {string} label @param {string} placeholder */
function passwordField(id, label, placeholder) {
  return `<label class="field field--password" for="${id}">
    <span class="field__label">${escapeHtml(label)}</span>
    <input id="${id}" name="${id}" type="password" placeholder="${escapeHtml(placeholder)}" autocomplete="off">
    <button class="field__eye" type="button" data-action="toggle-password" data-target="${id}" aria-label="نمایش گذرواژه">${icon('eye-outline')}</button>
    <span class="field__icon field__icon--lock">${icon('lock-outline')}</span>
  </label>`;
}

/** @param {Array<{id:string,label:string}>} questions @param {boolean} [compact] */
function securityRows(questions, compact = false) {
  return `<div class="security-grid ${compact ? 'security-grid--compact' : ''}">
    ${questions.map((question, index) => `<div class="security-row">
      <span class="security-row__index">${numberFa(index + 1)}</span>
      <div class="security-row__prompt"><span>${escapeHtml(question.label)}</span>${icon('chevron-down')}</div>
      <input type="hidden" name="questionId" value="${escapeHtml(question.id)}">
      <input class="security-row__answer" name="answer" type="text" placeholder="پاسخ شما" autocomplete="off" required>
    </div>`).join('')}
  </div>`;
}

function loginForm() {
  return `<div class="auth-form auth-form--login">
    <div class="auth-heading">${icon('account-arrow-right-outline', 'auth-heading__icon')}<div><span>خوش آمدید</span><h1>ورود به حساب</h1></div></div>
    <form data-auth-form="login" novalidate>
      ${field('username', 'نام کاربری', 'text', 'saeed.k', 'account-outline', 'value="saeed.k" autocomplete="username"')}
      ${passwordField('password', 'گذرواژه', '••••••••')}
      <button class="text-link" type="button" data-go="/_auth/recovery">گذرواژه را فراموش کردهاید؟</button>
      <button class="primary-button primary-button--wide" type="submit" disabled><span>ورود به حساب</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
      <div class="auth-divider"><span>یا</span></div>
      <button class="text-link text-link--center" type="button" data-go="/_auth/register">ساخت حساب جدید؟ هنوز حساب ندارید؟</button>
      <p class="auth-privacy">${icon('lock-outline')} اطلاعات حساب شما محرمانه میماند.</p>
    </form>
  </div>`;
}

/** @param {any[]} questions */
function registerForm(questions) {
  return `<div class="auth-form auth-form--register">
    <div class="auth-heading auth-heading--compact">${icon('account-plus-outline', 'auth-heading__icon')}<div><span>شروع همراهی</span><h1>ساخت حساب جدید</h1></div></div>
    <form data-auth-form="register" novalidate>
      ${field('username', 'نام کاربری', 'text', 'saeed.karimi', 'account-outline', 'autocomplete="username"')}
      <p class="field-hint">۳ تا ۴۰ نویسه؛ فقط حروف کوچک انگلیسی، عدد و نقطه</p>
      <div class="field-pair">${passwordField('password', 'گذرواژه', '••••••••')}${passwordField('repeatPassword', 'تکرار گذرواژه', '••••••••')}</div>
      <p class="field-hint">حداقل ۸ نویسه شامل یک حرف و یک عدد</p>
      <label class="check-row"><input type="checkbox" data-action="toggle-all-passwords"><span>نمایش گذرواژهها</span></label>
      <div class="security-heading"><span>برای امنیت و بازیابی حساب</span><h2>پنج پرسش امنیتی</h2><span class="security-progress">${numberFa(0)} از ${numberFa(5)}</span></div>
      ${securityRows(questions)}
      <button class="primary-button primary-button--wide" type="submit"><span>ساخت حساب امن</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
      <button class="text-link text-link--center" type="button" data-go="/_auth/login">ورود شوید؟ قبلاً حساب ساختید؟</button>
      <p class="auth-privacy">${icon('shield-check-outline')} پاسخها را کسی جز شما نمییابد.</p>
    </form>
  </div>`;
}

/** @param {any} recovery */
function recoveryForm(recovery) {
  const step = recovery?.step || 'account';
  const steps = [
    { id: 'account', label: 'حساب' }, { id: 'questions', label: 'پرسشها' },
    { id: 'reset', label: 'گذرواژه' }, { id: 'done', label: 'پایان' }
  ];
  const current = Math.max(0, steps.findIndex((item) => item.id === step));
  const progress = `<div class="stepper">${steps.map((item, index) => `<span class="${index <= current ? 'is-done' : ''}">${numberFa(index + 1)} ${escapeHtml(item.label)}</span>`).join('')}</div>`;
  let content = '';
  if (step === 'account') {
    content = `<form data-auth-form="recovery-account" novalidate>
      ${field('username', 'نام کاربری', 'text', 'saeed.k', 'account-outline', 'autocomplete="username"')}
      <button class="primary-button primary-button--wide" type="submit"><span>ادامه</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
    </form>`;
  } else if (step === 'questions') {
    const questions = (recovery?.questions || []).map((item) => ({ id: item.id || item.questionId, label: item.label || item.prompt || 'پرسش امنیتی' }));
    content = `<form data-auth-form="recovery-questions" novalidate>
      <p class="recovery-note">به سه پرسش امنیتی پاسخ دهید. ${escapeHtml(recovery?.attemptsRemaining ? `فرصت باقیمانده: ${numberFa(recovery.attemptsRemaining)}` : '')}</p>
      <div class="security-grid security-grid--compact">${questions.map((question, index) => `<div class="security-row">
        <span class="security-row__index">${numberFa(index + 1)}</span>
        <div class="security-row__prompt"><span>${escapeHtml(question.label)}</span></div>
        <input type="hidden" name="questionId" value="${escapeHtml(question.id)}">
        <input class="security-row__answer" name="answer" type="text" placeholder="پاسخ شما" required>
      </div>`).join('')}</div>
      <button class="primary-button primary-button--wide" type="submit"><span>بررسی پاسخها</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
    </form>`;
  } else if (step === 'reset') {
    content = `<form data-auth-form="recovery-reset" novalidate>
      ${passwordField('newPassword', 'گذرواژه تازه', '••••••••')}
      <p class="field-hint">حداقل ۸ نویسه شامل یک حرف و یک عدد</p>
      <button class="primary-button primary-button--wide" type="submit"><span>ذخیره گذرواژه</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
    </form>`;
  } else {
    content = `<div class="recovery-done">${icon('check-circle-outline')}<h2>گذرواژه ذخیره شد</h2><p>اکنون میتوانید با گذرواژه تازه وارد حساب شوید.</p><button class="primary-button primary-button--wide" type="button" data-go="/_auth/login"><span>ورود به حساب</span>${icon('arrow-left')}</button></div>`;
  }
  return `<div class="auth-form auth-form--recovery">
    <div class="auth-heading auth-heading--compact">${icon('shield-key-outline', 'auth-heading__icon')}<div><span>بازیابی حساب</span><h1>${step === 'done' ? 'انجام شد' : 'بازگشت امن'}</h1></div></div>
    ${progress}${content}
    <button class="text-link text-link--center" type="button" data-go="/_auth/login">بازگشت به ورود</button>
  </div>`;
}

/** @param {any[]} questions */
function onboardingForm(questions) {
  return `<div class="auth-form auth-form--register">
    <div class="auth-heading auth-heading--compact">${icon('shield-account-outline', 'auth-heading__icon')}<div><span>یک گام مانده</span><h1>پرسشهای امنیتی</h1></div></div>
    <form data-auth-form="onboarding" novalidate>
      <p class="recovery-note">پنج پاسخ امنیتی برای بازیابی حساب خود ثبت کنید.</p>
      ${securityRows(questions)}
      <button class="primary-button primary-button--wide" type="submit"><span>ورود به نقشه</span>${icon('arrow-left')}</button>
      <div class="form-error" data-form-error hidden></div>
    </form>
  </div>`;
}

/** @param {string} view @param {any} state */
export function renderAuth(view, state) {
  const kind = view === 'register' ? 'register' : view === 'recovery' ? 'recovery' : view === 'onboarding' ? 'onboarding' : 'login';
  const questions = state.securityQuestions || [];
  const panel = kind === 'register' ? registerForm(questions)
    : kind === 'recovery' ? recoveryForm(state.recovery)
      : kind === 'onboarding' ? onboardingForm(questions)
        : loginForm();
  return `${authChrome()}<main class="auth-stage"><section class="auth-frame auth-frame--${kind}">
    ${authIntro(kind)}<div class="auth-panel">${panel}</div>
  </section></main>`;
}

/** @param {HTMLFormElement} form */
function securityQuestionsFrom(form) {
  const ids = [...form.querySelectorAll('input[name="questionId"]')];
  const answers = [...form.querySelectorAll('input[name="answer"]')];
  return ids.map((input, index) => ({
    questionId: /** @type {HTMLInputElement} */(input).value,
    answer: /** @type {HTMLInputElement} */(answers[index])?.value.trim() || ''
  }));
}

/** @param {HTMLFormElement} form @param {string} message */
function showFormError(form, message) {
  const node = /** @type {HTMLElement|null} */(form.querySelector('[data-form-error]'));
  if (!node) { toast(message, 'error'); return; }
  node.textContent = message;
  node.hidden = false;
}

/** @param {HTMLFormElement} form */
function clearFormError(form) {
  const node = /** @type {HTMLElement|null} */(form.querySelector('[data-form-error]'));
  if (node) { node.hidden = true; node.textContent = ''; }
}

/** @param {string} view @param {any} state */
export function bindAuth(view, state) {
  const root = /** @type {HTMLElement|null} */(document.getElementById('app'));
  const form = /** @type {HTMLFormElement|null} */(root?.querySelector('form[data-auth-form]'));
  state.action = /** @param {string} action @param {HTMLElement} element */(action, element) => {
    if (action === 'theme') {
      const choice = cycleTheme();
      toast(choice === 'system' ? 'تم: هماهنگ با سیستم' : choice === 'dark' ? 'تم: تاریک' : 'تم: روشن');
    } else if (action === 'toggle-password') {
      const target = element.getAttribute('data-target');
      const input = target ? /** @type {HTMLInputElement|null} */(document.getElementById(target)) : null;
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    } else if (action === 'toggle-all-passwords') {
      const checked = /** @type {HTMLInputElement} */(element).checked;
      for (const input of document.querySelectorAll('form input[type="password"], form input[data-was-password]')) {
        const field = /** @type {HTMLInputElement} */(input);
        if (checked) { field.dataset.wasPassword = '1'; field.type = 'text'; }
        else if (field.dataset.wasPassword) { field.type = 'password'; delete field.dataset.wasPassword; }
      }
    }
  };
  state.submit = /** @param {HTMLFormElement} submitted */async (submitted) => {
    if (!submitted || !form || submitted !== form) return;
    clearFormError(form);
    const kind = form.getAttribute('data-auth-form');
    const values = /** @type {Record<string,string>} */(Object.fromEntries(new FormData(form).entries()));
    try {
      if (kind === 'login') {
        await post('/_auth/login', {
          username: values.username.trim(), password: values.password,
          deviceId: 'web-browser', deviceName: navigator.userAgent.slice(0, 80)
        });
        await state.onAuthenticated();
      } else if (kind === 'register') {
        if (values.password !== values.repeatPassword) throw new Error('تکرار گذرواژه یکسان نیست.');
        const securityQuestions = securityQuestionsFrom(form);
        if (securityQuestions.some((item) => item.answer.length < 2)) throw new Error('به پنج پرسش امنیتی پاسخ دهید.');
        await post('/_auth/register', { username: values.username.trim(), password: values.password, securityQuestions });
        toast('حساب ساخته شد. اکنون وارد شوید.', 'success');
        go('/_auth/login');
      } else if (kind === 'recovery-account') {
        const result = await post('/_auth/recovery/start', { username: values.username.trim() });
        state.recovery = {
          step: 'questions', recoveryId: result.recoveryId,
          questions: result.questions || result.challenges || result.items || [],
          attemptsRemaining: result.attemptsRemaining
        };
        rerender();
      } else if (kind === 'recovery-questions') {
        const answers = securityQuestionsFrom(form);
        const result = await post('/_auth/recovery/answers', { recoveryId: state.recovery.recoveryId, answers });
        state.recovery.step = 'reset';
        state.recovery.resetToken = result.resetToken;
        state.recovery.questions = [];
        rerender();
      } else if (kind === 'recovery-reset') {
        await post('/_auth/recovery/reset', {
          recoveryId: state.recovery.recoveryId,
          resetToken: state.recovery.resetToken,
          newPassword: values.newPassword
        });
        state.recovery.step = 'done';
        rerender();
      } else if (kind === 'onboarding') {
        const securityQuestions = securityQuestionsFrom(form);
        if (securityQuestions.some((item) => item.answer.length < 2)) throw new Error('به پنج پرسش امنیتی پاسخ دهید.');
        await post('/_user/security-questions', { securityQuestions });
        toast('پرسشهای امنیتی ذخیره شد.', 'success');
        await state.onAuthenticated();
      }
    } catch (error) {
      showFormError(form, errorMessage(error));
    }
  };
  if (form) {
    if (form.getAttribute('data-auth-form') === 'login') {
      const cta = /** @type {HTMLButtonElement|null} */(form.querySelector('button[type="submit"]'));
      const update = () => { if (cta) cta.disabled = !(/** @type {HTMLInputElement} */(form.elements.namedItem('username'))).value.trim() || !(/** @type {HTMLInputElement} */(form.elements.namedItem('password'))).value; };
      form.addEventListener('input', update);
      update();
    }
    const progress = /** @type {HTMLElement|null} */(form.querySelector('.security-progress'));
    if (progress) {
      const update = () => {
        const filled = securityQuestionsFrom(form).filter((item) => item.answer.length >= 2).length;
        progress.textContent = `${numberFa(filled)} از ${numberFa(5)}`;
      };
      form.addEventListener('input', update);
      update();
    }
  }
}
