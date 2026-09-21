import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet, useLocation } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Description, Input, Label, Skeleton, Spinner, TextArea, TextField, Select, ListBox } from '@heroui/react';
import { ArrowRightIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, CalendarBlankIcon, CheckIcon, CopyIcon, GithubLogoIcon, LockSimpleIcon, ShieldCheckIcon, TrashIcon } from '@phosphor-icons/react';
import GuidePage from './Guide';
import { useLocale, localizeWarning } from './locale';
import { pageSeo, seoHead } from './seo';
import { currentTerm, termOptions, termLabel } from './terms';
import type { CalendarSnapshot, SyncRequest, SyncResponse } from './shared';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';
type Translation = [string, string];
class RequestFailure extends Error {
  constructor(public translation: Translation) { super(translation[0]); }
}

function failure(status: number): Translation {
  if (status === 401 || status === 403) return ["Verification failed. Check your management link, or sign in to Vergil again and copy both tokens.", "验证未通过。请检查管理链接，或重新登录 Vergil 并获取两项 Token。"];
  if (status === 404) return ["Calendar not found. It may have been revoked. Check your full management link.", "找不到这个日历。它可能已被撤销，请检查完整的管理链接。"];
  if (status === 429) return ["Too many requests. Please try again later.", "请求过于频繁，请稍后再试。"];
  if (status === 400 || status === 422) return ["Check your term, dates, and both tokens, then try again.", "无法处理这些信息。请检查学期、日期与两项 Token 后重试。"];
  return ["The course service is unavailable. Please try again later. Your saved calendar has not changed.", "暂时无法连接课程服务，请稍后重试。已有日历内容不会因此被覆盖。"];
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new RequestFailure(failure(response.status));
  return response.json() as Promise<T>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-sm leading-6 ${error ? 'bg-danger/8 text-danger' : 'bg-accent/7 text-foreground'}`}>{children}</div>;
}

function Shell() {
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  useEffect(() => {
    if (location.search.lang) setLocale(location.search.lang);
    else if (locale === 'zh-CN') void router.navigate({ to: '.', search: { lang: locale }, hash: location.hash, replace: true });
  }, [location.search.lang]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', location.search.lang ?? locale);
    const origin = document.querySelector<HTMLMetaElement>('meta[name="app-origin"]')?.content || url.origin;
    document.head.querySelectorAll('[data-seo]').forEach(element => element.remove());
    document.head.insertAdjacentHTML('beforeend', seoHead(pageSeo(url, origin)));
  }, [location.pathname, location.search.lang, locale]);
  return <div className="min-h-screen flex flex-col">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>{t("Skip to main content", "跳至主要内容")}</a>
    <header className="border-b border-border/60 bg-surface/80">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-9">
        <Link to="/" search={{ lang: locale }} className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight">
          <CalendarBlankIcon size={24} weight="duotone" className="text-accent" aria-hidden="true" />
          <span>Vergil <span className="hidden font-normal text-muted sm:inline">Calendar</span></span>
        </Link>
        <nav aria-label={t("Main navigation", "主导航")} className="flex items-center gap-2 text-sm sm:gap-7">
          <Link to="/" search={{ lang: locale }} className="nav-link hidden sm:inline-flex" activeProps={{ 'aria-current': 'page' }}>{t("Create", "创建订阅")}</Link>
          <Link to="/guide" search={{ lang: locale }} className="nav-link inline-flex" activeProps={{ 'aria-current': 'page' }}>{t("Guide", "使用指南")}</Link>
          <a href={githubUrl} className="nav-link inline-flex" target="_blank" rel="noreferrer" aria-label={t("GitHub source code (opens in a new tab)", "GitHub 源代码（新窗口）")}><GithubLogoIcon size={21} aria-hidden="true" /><span className="hidden sm:inline">GitHub</span></a>
          <Button variant="ghost" size="sm" aria-label={t('Switch to Chinese', '切换到英文')} onPress={() => { const lang = locale === 'en' ? 'zh-CN' : 'en'; setLocale(lang); void router.navigate({ to: '.', search: { lang }, hash: location.hash, replace: true }); }}><span lang={locale === 'en' ? 'zh-CN' : 'en'}>{locale === 'en' ? '中文' : 'English'}</span></Button>
        </nav>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-9 sm:py-14"><Outlet /></main>
    <footer className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-3 px-5 pb-7 pt-9 text-xs leading-5 text-muted sm:flex-row sm:px-9">
      <p>{t("An independent, open-source project. Not affiliated with Columbia University.", "为更从容的校园日常。独立开源项目，与 Columbia University 无隶属关系。")}</p>
      <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 self-start sm:-my-3">{t("View source", "查看源代码")} <ArrowSquareOutIcon size={13} aria-hidden="true" /></a>
    </footer>
  </div>;
}

function Intro({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <div className="mb-9 max-w-2xl sm:mb-11">
    <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-muted uppercase">{eyebrow}</p>
    <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-tight">{title}</h1>
    <p className="mt-4 max-w-xl text-base leading-7 text-muted">{children}</p>
  </div>;
}

function SyncForm({ snapshot, managementToken, onSuccess, onPendingChange }: {
  snapshot?: CalendarSnapshot;
  managementToken?: string;
  onSuccess: (result: SyncResponse) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { locale, t } = useLocale();
  const [term, setTerm] = useState(snapshot?.term || currentTerm());
  const [pending, setPending] = useState(false);
  const [credentialVersion, setCredentialVersion] = useState(0);
  const [error, setError] = useState<Translation | null>(null);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const request: SyncRequest = {
      accessToken: String(data.get('accessToken') || '').trim(),
      refreshToken: String(data.get('refreshToken') || '').trim(),
      term,
      title: String(data.get('title') || '').trim() || undefined,
      excludedDates: [...new Set(String(data.get('excludedDates') || '').split(/[\s,，]+/).filter(Boolean))],
    };
    // Clear the DOM immediately and remount fields to discard their internal value state.
    for (const name of ['accessToken', 'refreshToken']) {
      (form.elements.namedItem(name) as HTMLInputElement).value = '';
      data.delete(name);
    }
    setCredentialVersion(version => version + 1);
    setError(null);
    if (!request.accessToken || !request.refreshToken) {
      setError(["Enter both an Access Token and a Refresh Token. The fields have been cleared; paste both again.", "请填写 Access Token 和 Refresh Token。输入已清空，请重新粘贴两项。"]);
      return;
    }
    if (!/^\d{4}[123]$/.test(request.term)) {
      setError(["Select a valid term, then paste both tokens again.", "请选择有效的学期，然后重新粘贴两项 Token。"]);
      return;
    }
    if (request.excludedDates?.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      setError(["Use valid YYYY-MM-DD dates, one per line. Correct the dates and paste both tokens again.", "排除日期应为有效的 YYYY-MM-DD 日期，每行一个。请修正后重新粘贴两项 Token。"]);
      return;
    }
    inFlight.current = true;
    setPending(true);
    onPendingChange?.(true);
    try {
      const response = await fetch(snapshot ? `/api/calendars/${encodeURIComponent(snapshot.id)}/sync` : '/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(managementToken ? { Authorization: `Bearer ${managementToken}` } : {}) },
        body: JSON.stringify(request),
        cache: 'no-store',
      });
      const result = await readResponse<SyncResponse>(response);
      if (!snapshot && !result.managementToken) throw new RequestFailure(["No management link was returned. Please try again later.", "未收到管理链接，请稍后重试。"]);
      onSuccess(result);
    } catch (cause) {
      setError(cause instanceof RequestFailure ? cause.translation : ["Connection failed. Check your network and paste both tokens again. Your saved calendar has not changed.", "网络连接失败，请检查网络后重试。请重新粘贴两项 Token；已有日历内容保持不变。"]);
    } finally {
      request.accessToken = '';
      request.refreshToken = '';
      inFlight.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return <form onSubmit={submit} noValidate className="space-y-7">
    <fieldset disabled={pending} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-[1fr_1.45fr]">
        <Select name="term" value={term} onChange={value => { if (typeof value === 'string') setTerm(value); }} variant="secondary" fullWidth isRequired isDisabled={pending}>
          <Label>{t("Term", "学期")}</Label>
          <Select.Trigger><Select.Value>{termLabel(term, locale)}</Select.Value><Select.Indicator /></Select.Trigger>
          <Description>{t("Select your academic term", "选择课程所在学期")}</Description>
          <Select.Popover><ListBox key={locale}>{termOptions(snapshot?.term).map(value => <ListBox.Item id={value} key={value} textValue={termLabel(value, locale)}><Label>{termLabel(value, locale)}</Label><ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select>
        <TextField name="title" defaultValue={snapshot?.title || ''}>
          <Label>{t("Calendar name", "日历名称")} <span className="font-normal text-muted">{t("(optional)", "（可选）")}</span></Label>
          <Input variant="secondary" maxLength={100} placeholder={t("My class schedule", "我的课程表")} />
          <Description>{t("A name you will recognize in your calendar app", "方便在日历 App 中辨认")}</Description>
        </TextField>
      </div>
      <div className="space-y-5 border-t border-border/70 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{t("Connect to Vergil", "连接 Vergil")}</h3>
          <Link to="/guide" search={{ lang: locale }} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent">{t("How to get tokens", "如何获取 Token")} <ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>
        </div>
        <TextField key={`access-${credentialVersion}`} name="accessToken" isRequired autoComplete="off">
          <Label>Access Token</Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder={t("Paste access_token", "粘贴 access_token")} data-1p-ignore="true" data-lpignore="true" />
        </TextField>
        <TextField key={`refresh-${credentialVersion}`} name="refreshToken" isRequired autoComplete="off">
          <Label>Refresh Token</Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder={t("Paste refresh_token", "粘贴 refresh_token")} data-1p-ignore="true" data-lpignore="true" />
          <Description>{t("Both are required. Inputs clear on submission; school tokens are never saved.", "两项均必填。提交后立即清空输入，不保存学校 Token。")}</Description>
        </TextField>
      </div>
      <details className="border-t border-border/70 pt-3" open={snapshot?.excludedDates.length ? true : undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">{t("Skip dates without classes", "跳过不上课的日期")} <span className="text-xs font-normal text-muted">{t("Optional +", "可选 ＋")}</span></summary>
        <TextField name="excludedDates" defaultValue={snapshot?.excludedDates.join('\n') || ''} className="mt-3">
          <Label>{t("Excluded dates", "排除日期")}</Label>
          <TextArea variant="secondary" rows={4} placeholder={'2026-11-26\n2026-11-27'} spellCheck={false} />
          <Description>{t("One YYYY-MM-DD date per line. Follow your course schedule; holidays are not excluded automatically.", "每行一个 YYYY-MM-DD 日期。请以自己的课程安排为准，系统不会默认排除节假日。")}</Description>
        </TextField>
      </details>
    </fieldset>
    {error && <Notice error>{t(...error)}</Notice>}
    <div>
      <Button type="submit" size="lg" fullWidth isPending={pending} isDisabled={pending}>
        {pending ? <><Spinner size="sm" color="current" />{t("Reading your courses…", "正在读取课程…")}</> : <>{snapshot ? t("Update courses", "更新课程") : t("Create subscription", "创建日历订阅")}<ArrowRightIcon size={18} aria-hidden="true" /></>}
      </Button>
      <p className="mt-3 flex items-start justify-center gap-1.5 text-xs leading-5 text-muted"><LockSimpleIcon size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{t("Only your course snapshot is saved. School credentials are never stored.", "仅将课程快照存入日历服务，不保存学校登录凭据。")}</p>
    </div>
  </form>;
}

function CreatePage() {
  const { locale, t } = useLocale();
  const [created, setCreated] = useState<SyncResponse>();
  if (created) return <>
    <Intro eyebrow={t('Ready for your calendar', '准备就绪')} title={t("Your schedule is ready.", "课表，准备好了。")}>{t("Subscribe once to see your courses in your favorite calendar. Save your private management link first.", "订阅一次，即可在常用日历里查看课程。请先保存下方的私密管理链接。")}</Intro>
    <div className="grid gap-7 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={created} managementToken={created.managementToken!} /><CourseList snapshot={created} /></div>
      <aside className="space-y-5"><Notice><span className="flex items-center gap-2 font-medium"><CheckIcon size={17} />{t("Subscription created", "订阅已创建")}</span><p className="mt-2">{t("The token fields have been cleared. Use your private management link to update your courses when they change.", "学校 Token 输入已清空。选课发生变化后，使用私密管理链接重新读取课程。")}</p></Notice><HowItWorks /></aside>
    </div>
  </>;
  return <>
    <Intro eyebrow={t('Your schedule, in sync with your day', '让课表融入日常')} title={t("Your classes. In your calendar.", "把课表，放进你的日历。")}>{t("Bring your Vergil schedule to Apple Calendar, Google Calendar, or Outlook with a subscription link.", "将 Vergil 课程转换为订阅链接，在 Apple 日历、Google 日历或 Outlook 中轻松查看。")}</Intro>
    <div className="grid items-start gap-9 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
      <Card className="p-6 sm:p-8">
        <Card.Header className="mb-6"><Card.Title className="text-lg">{t("Create a course subscription", "创建课程订阅")}</Card.Title><Card.Description>{t("Choose your term and have both Vergil tokens ready.", "准备好本学期信息和 Vergil 的两项 Token。")}</Card.Description></Card.Header>
        <Card.Content><SyncForm onSuccess={result => { setCreated(result); window.scrollTo({ top: 0 }); }} /></Card.Content>
      </Card>
      <aside className="space-y-8 lg:pt-3">
        <HowItWorks />
        <div className="border-t border-border/80 pt-7"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheckIcon size={21} className="text-accent" aria-hidden="true" />{t("Your credentials, used just this once", "你的凭据，只用于这次读取")}</div><p className="text-sm leading-7 text-muted">{t("We save the course snapshot needed for your calendar, never your school tokens. Tokens pass through this server, so only use a deployment you trust.", "服务只保存生成日历所需的课程快照，不保存学校 Token。Token 仍会经过部署此服务的服务器，请仅使用你信任的部署。")}</p></div>
        <Link to="/guide" search={{ lang: locale }} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent">{t("First time here? Read the guide", "第一次使用？查看完整指南")} <ArrowRightIcon size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </>;
}

function HowItWorks() {
  const { locale, t } = useLocale();
  return <section aria-labelledby="how-it-works"><h2 id="how-it-works" className="mb-6 text-sm font-semibold">{t("From class schedule to calendar", "从课程到日常，只需三步")}</h2><ol className="space-y-6">
    {[
      [t("Get your tokens", "获取 Token"), t("Sign in to Vergil and copy both tokens from your browser’s developer tools.", "登录 Vergil，在浏览器开发者工具中复制两项 Token。")],
      [t("Create a subscription", "生成订阅链接"), t("Read your registered courses and create a link for your calendar app.", "读取本学期课程，生成与你的日历 App 兼容的链接。")],
      [t("Add to your calendar", "添加到日历"), t("Choose “Subscribe from URL” to see your classes alongside your day.", "选择“从 URL 订阅”，让课程出现在你习惯的位置。")],
    ].map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-default text-xs font-semibold text-muted">{index + 1}</span><div><h3 className="text-sm font-medium leading-7">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div></li>)}
  </ol><p className="mt-7 text-xs leading-6 text-muted">{t("Courses do not sync in the background. Enter fresh tokens to update the same link; your calendar app controls how often it refreshes.", "课程不会在后台自动同步。更新需再次输入 Token；订阅地址保持不变，日历 App 按自身节奏刷新。")}</p></section>;
}

function CopyField({ label, value, privateLink = false }: { label: string; value: string; privateLink?: boolean }) {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<Translation | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus(["Copied", "已复制"]); }
    catch { setStatus(["Could not copy automatically. Select the link and copy it manually.", "未能自动复制，请选中链接并手动复制。"]); }
  }
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={privateLink ? 'management-link' : 'subscription-link'}>{label}</label>
    <div className="flex gap-2"><Input id={privateLink ? 'management-link' : 'subscription-link'} aria-label={label} readOnly value={value} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" /><Button variant="secondary" aria-label={`${t('Copy', '复制')} ${label}`} onPress={copy}><CopyIcon size={17} aria-hidden="true" /><span className="hidden sm:inline">{t("Copy", "复制")}</span></Button></div>
    <p className="text-xs leading-5 text-muted" role="status">{status ? t(...status) : (privateLink ? t("This link allows updates and revocation. Keep it private.", "持有此链接的人可更新或撤销日历，请私密保存。") : t("Anyone with this link can view your schedule. Share with care.", "持有订阅链接的人可查看课表，请谨慎分享。"))}</p>
  </div>;
}

function SubscriptionLinks({ snapshot, managementToken }: { snapshot: CalendarSnapshot; managementToken: string }) {
  const { locale, t } = useLocale();
  const feed = new URL(snapshot.feedUrl, window.location.origin).href;
  const manage = `${window.location.origin}/manage/${encodeURIComponent(snapshot.id)}#${managementToken}`;
  return <Card className="p-6 sm:p-7"><Card.Header><Card.Title className="text-lg">{t("Add to your calendar", "添加到日历")}</Card.Title><Card.Description>{t("Copy the link and choose “Subscribe to calendar” in your calendar app.", "复制链接，在日历 App 中选择“订阅日历”。")}</Card.Description></Card.Header><Card.Content className="mt-5 space-y-6">
    <CopyField label={t("Calendar subscription link", "日历订阅链接")} value={feed} />
    <a className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent" href={feed.replace(/^https?:/, 'webcal:')}><CalendarBlankIcon size={19} aria-hidden="true" />{t("Open in calendar app", "在日历 App 中打开")} <ArrowSquareOutIcon size={15} aria-hidden="true" /></a>
    <div className="border-t border-border/70 pt-6"><CopyField label={t("Private management link · Save this", "私密管理链接 · 请保存")} value={manage} privateLink /><a href={manage} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm text-accent">{t("Open management page", "打开管理页面")} <ArrowRightIcon size={15} aria-hidden="true" /></a></div>
  </Card.Content></Card>;
}

function CourseList({ snapshot }: { snapshot: CalendarSnapshot }) {
  const { locale, t } = useLocale();
  const formatDate = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const weekdays = locale === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return <Card className="p-6 sm:p-7"><Card.Header><div className="flex items-center justify-between gap-3"><Card.Title className="text-lg">{t("Your courses", "课程概览")}</Card.Title><span className="text-sm text-muted">{t(`${snapshot.courseCount} ${snapshot.courseCount === 1 ? 'course' : 'courses'}`, `${snapshot.courseCount} 门课程`)}</span></div><Card.Description>{t("All times are in America/New_York", "时间均为 America/New_York（纽约时间）")}</Card.Description></Card.Header><Card.Content className="mt-4">
    {snapshot.warnings.length > 0 && <div className="mb-5"><Notice><p className="font-medium">{t("Schedule notes", "请留意以下课程信息")}</p><ul className="mt-1 list-inside list-disc">{snapshot.warnings.map((warning, index) => <li key={index}>{localizeWarning(warning, locale)}</li>)}</ul></Notice></div>}
    {snapshot.courses.length === 0 ? <p className="py-5 text-sm leading-6 text-muted">{t("No courses to display for this term. Check the selected term and your Vergil registrations.", "本学期没有可显示的课程。请确认学期和 Vergil 中的选课记录。")}</p> : <ul className="divide-y divide-border/70">{snapshot.courses.map(course => <li key={course.id} className="py-5 first:pt-1 last:pb-1"><p className="text-xs font-medium tracking-wide text-accent">{course.code}{course.section ? ` · ${course.section}` : ''}</p><h3 className="mt-1 text-base font-medium">{course.title}</h3>{course.meetings.length ? <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted">{course.meetings.map(meeting => <li key={meeting.id}><p>{meeting.days.map(day => weekdays[day]).join(t(', ', '、'))} · {meeting.startTime.slice(0, 5)}–{meeting.endTime.slice(0, 5)}</p><p className="text-xs">{meeting.location || t("Location pending", "地点待定")} · {formatDate(meeting.startDate)} {t('to', '至')} {formatDate(meeting.endDate)}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted">{t("Meeting times are pending; no calendar events have been generated.", "尚无确定上课时间，未生成日历事件。")}</p>}</li>)}</ul>}
    {snapshot.excludedDates.length > 0 && <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-6 text-muted">{t('Excluded dates: ', '已跳过的日期：')}{snapshot.excludedDates.map(formatDate).join(t(', ', '、'))}</p>}
  </Card.Content></Card>;
}

function ManagePage() {
  const { id } = manageRoute.useParams();
  const hash = useLocation({ select: location => location.hash });
  const managementToken = hash.replace(/^#/, '');
  // Remount for a changed fragment so an old authorized snapshot never masks a bad link.
  return <ManagedCalendar key={`${id}:${managementToken}`} id={id} managementToken={managementToken} />;
}

function ManagedCalendar({ id, managementToken }: { id: string; managementToken: string }) {
  const { locale, t } = useLocale();
  const queryClient = useQueryClient();
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<Translation | null>(null);
  const [error, setError] = useState<Translation | null>(null);
  const query = useQuery({
    queryKey: ['calendar', id],
    queryFn: async ({ signal }) => readResponse<CalendarSnapshot>(await fetch(`/api/calendars/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${managementToken}` }, signal, cache: 'no-store' })),
    enabled: Boolean(managementToken) && !deleted,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  async function remove() {
    if (deleting || syncing) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendars/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managementToken}` } });
      if (!response.ok) throw new RequestFailure(failure(response.status));
      setDeleted(true);
      queryClient.removeQueries({ queryKey: ['calendar', id] });
    } catch { setError(["Could not revoke the subscription. Your calendar is still saved. Check your network and management link, then try again.", "撤销失败，日历仍然保留。请检查网络与管理链接后重试。"]); }
    finally { setDeleting(false); }
  }
  if (deleted) return <><Intro eyebrow={t('Calendar removed', '订阅已撤销')} title={t("Subscription revoked.", "订阅已撤销。")}>{t("The saved course snapshot has been deleted and the old link is no longer valid. You may need to remove cached events from your calendar app.", "服务器上的课程快照已删除，原订阅链接已失效。日历 App 中缓存的事件可能仍需手动移除。")}</Intro><Link to="/" search={{ lang: locale }} className="inline-flex min-h-11 items-center gap-2 text-accent">{t("Create a new subscription", "创建新的订阅")} <ArrowRightIcon size={17} /></Link></>;
  if (!managementToken) return <><Intro eyebrow={t('Private calendar', '私密日历')} title={t("Use your full management link.", "需要完整的管理链接。")}>{t("Open the private management link saved when you created your calendar, including everything after #. A subscription link cannot manage a calendar.", "请打开创建日历时保存的私密管理链接，包含 # 后的管理凭据。订阅链接无法用于管理日历。")}</Intro><Link to="/guide" search={{ lang: locale }} className="inline-flex min-h-11 items-center text-accent">{t("Read the guide", "查看使用指南")}</Link></>;
  if (query.isPending || query.isFetching) return <div aria-busy="true" aria-label={t("Loading calendar", "正在加载日历")} className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-5 w-4/5 max-w-xl" /><Skeleton className="mt-10 h-96 w-full max-w-2xl rounded-3xl" /><p role="status" className="text-sm text-muted">{t("Loading your course calendar…", "正在加载课程日历…")}</p></div>;
  if (query.isError || !query.data) return <><Intro eyebrow={t('Calendar unavailable', '日历暂不可用')} title={t("Calendar unavailable.", "暂时无法打开日历。")}>{query.error instanceof TypeError ? t("Connection failed. Check your network and try again.", "网络连接失败，请检查网络后重试。") : query.error instanceof RequestFailure ? t(...query.error.translation) : t("Check your management link and try again.", "请检查管理链接后重试。")}</Intro><Button variant="secondary" onPress={() => query.refetch()} isPending={query.isFetching}>{t("Reload", "重新加载")}</Button></>;
  const snapshot = query.data;
  return <>
    <Intro eyebrow={t('Your calendar', '你的日历')} title={snapshot.title}>{t('Last updated ', '最后更新于 ')}{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(snapshot.updatedAt))}{t(' (New York time). Your subscription link stays the same.', '（纽约时间）。更新后订阅地址保持不变。')}</Intro>
    {status && <div className="mb-6"><Notice>{t(...status)}</Notice></div>}
    <div className="grid items-start gap-7 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={snapshot} managementToken={managementToken} /><CourseList snapshot={snapshot} /></div>
      <div className="space-y-7">
        <Card className="p-6 sm:p-7"><Card.Header className="mb-6"><Card.Title className="flex items-center gap-2 text-lg"><ArrowsClockwiseIcon size={21} aria-hidden="true" />{t("Update courses", "更新课程")}</Card.Title><Card.Description>{t("Enter fresh school tokens to read your latest schedule. Your calendar app may take some time to refresh.", "重新获取两项学校 Token，读取最新课表。日历 App 的刷新可能需要一些时间。")}</Card.Description></Card.Header><Card.Content><fieldset disabled={deleting}><SyncForm key={snapshot.updatedAt} snapshot={snapshot} managementToken={managementToken} onPendingChange={setSyncing} onSuccess={result => { const { managementToken: _secret, ...safeSnapshot } = result; queryClient.setQueryData(['calendar', id], safeSnapshot); setStatus(["Courses updated. Your subscription link is unchanged; allow time for your calendar app to refresh.", "课程已更新。订阅链接保持不变，请等待日历 App 刷新。"]); }} /></fieldset></Card.Content></Card>
        <section className="px-2"><h2 className="text-sm font-medium">{t("No longer need this subscription?", "不再需要这个订阅？")}</h2><p className="mt-2 text-xs leading-6 text-muted">{t("Revoking deletes the saved schedule and disables both links. This cannot be undone.", "撤销会删除课程快照，使订阅与管理链接失效。此操作无法恢复。")}</p>{error && <div className="mt-3"><Notice error>{t(...error)}</Notice></div>}{confirmDelete ? <div className="mt-4 space-y-3"><p className="text-sm" role="alert">{t("Revoke this calendar subscription?", "确定撤销这个日历订阅？")}</p><div className="flex gap-2"><Button variant="danger" isPending={deleting} isDisabled={deleting || syncing} onPress={remove}>{t("Confirm revocation", "确认撤销")}</Button><Button variant="secondary" isDisabled={deleting} onPress={() => setConfirmDelete(false)}>{t("Cancel", "取消")}</Button></div></div> : <Button className="mt-2" variant="ghost" isDisabled={syncing} onPress={() => setConfirmDelete(true)}><TrashIcon size={16} aria-hidden="true" />{t("Revoke subscription", "撤销订阅")}</Button>}</section>
      </div>
    </div>
  </>;
}

function NotFound() {
  const { locale, t } = useLocale();
  return <><Intro eyebrow="404" title={t("Page not found.", "这个页面不存在。")}>{t("Return home to create your course calendar subscription.", "返回首页，创建你的课程日历订阅。")}</Intro><Link to="/" search={{ lang: locale }} className="text-accent">{t("Back to home", "返回首页")}</Link></>;
}
const rootRoute = createRootRoute({ validateSearch: (search: Record<string, unknown>): { lang?: 'en' | 'zh-CN' } => ({ lang: search.lang === 'en' || search.lang === 'zh-CN' ? search.lang : undefined }), component: Shell, notFoundComponent: NotFound });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: CreatePage });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/guide', component: GuidePage });
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/$id', component: ManagePage });
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, guideRoute, manageRoute]), scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
