import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet, useLocation } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Description, Input, Label, Skeleton, Spinner, TextArea, TextField, Select, ListBox } from '@heroui/react';
import { ArrowRightIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, CalendarBlankIcon, CopyIcon, GithubLogoIcon, LockSimpleIcon, ShieldCheckIcon, TrashIcon } from '@phosphor-icons/react';
import GuidePage from './Guide';
import { useLocale, localizeWarning } from './locale';
import { i18n } from './i18n';
import { pageSeo, seoHead } from './seo';
import { currentTerm, termOptions, termLabel } from './terms';
import type { CalendarSnapshot, LookupResponse, SyncRequest, SyncResponse } from './shared';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';
type MessageKey = string;
class RequestFailure extends Error {
  constructor(public translation: MessageKey) { super(i18n.t(translation, { lng: 'en' })); }
}

function failure(status: number): MessageKey {
  if (status === 401 || status === 403) return "errors.verification";
  if (status === 404) return "errors.calendarMissing";
  if (status === 429) return "errors.rateLimit";
  if (status === 400 || status === 422) return "errors.invalidInput";
  return "errors.courseService";
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
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>{t("navigation.skip")}</a>
    <header className="border-b border-border/60 bg-surface/80">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-9">
        <Link to="/" search={{ lang: locale }} className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight">
          <CalendarBlankIcon size={24} weight="duotone" className="text-accent" aria-hidden="true" />
          <span>{t("common.vergil")} <span className="hidden font-normal text-muted sm:inline">{t("common.calendar")}</span></span>
        </Link>
        <nav aria-label={t("navigation.main")} className="flex items-center gap-2 text-sm sm:gap-7">
          <Link to="/" search={{ lang: locale }} className="nav-link hidden sm:inline-flex" activeProps={{ 'aria-current': 'page' }}>{t("navigation.create")}</Link>
          <Link to="/guide" search={{ lang: locale }} className="nav-link inline-flex" activeProps={{ 'aria-current': 'page' }}>{t("navigation.guide")}</Link>
          <a href={githubUrl} className="nav-link inline-flex" target="_blank" rel="noreferrer" aria-label={t("navigation.sourceLabel")}><GithubLogoIcon size={21} aria-hidden="true" /><span className="hidden sm:inline">{t("common.github")}</span></a>
          <Button variant="ghost" size="sm" aria-label={t("navigation.switchLanguage")} onPress={() => { const lang = locale === 'en' ? 'zh-CN' : 'en'; setLocale(lang); void router.navigate({ to: '.', search: { ...location.search, lang }, hash: location.hash, replace: true }); }}><span lang={locale === 'en' ? 'zh-CN' : 'en'}>{t('common.languageName', { lng: locale === 'en' ? 'zh-CN' : 'en' })}</span></Button>
        </nav>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-9 sm:py-14"><Outlet /></main>
    <footer className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-3 px-5 pb-7 pt-9 text-xs leading-5 text-muted sm:flex-row sm:px-9">
      <p>{t("footer.independent")}</p>
      <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 self-start sm:-my-3">{t("navigation.source")} <ArrowSquareOutIcon size={13} aria-hidden="true" /></a>
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

function SyncForm({ snapshot, managementToken, onSuccess, onPendingChange, onLookup, onRotate }: {
  snapshot?: CalendarSnapshot;
  managementToken?: string;
  onSuccess: (result: SyncResponse) => void;
  onPendingChange?: (pending: boolean) => void;
  onLookup?: (calendars: CalendarSnapshot[]) => void;
  onRotate?: (snapshot: CalendarSnapshot) => void;
}) {
  const { locale, t } = useLocale();
  const [term, setTerm] = useState(snapshot?.term || currentTerm());
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState('sync');
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [credentialVersion, setCredentialVersion] = useState(0);
  const [error, setError] = useState<MessageKey | null>(null);
  const inFlight = useRef(false);
  const excludedDates = snapshot?.semesters.find(semester => semester.term === term)?.excludedDates ?? (snapshot?.term === term ? snapshot.excludedDates : []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    const lookup = Boolean(onLookup && action === 'lookup');
    const rotate = Boolean(snapshot && onRotate && confirmRotate && action === 'rotate');
    const form = event.currentTarget;
    const data = new FormData(form);
    const request: SyncRequest = {
      accessToken: String(data.get('accessToken') || '').trim(),
      refreshToken: String(data.get('refreshToken') || '').trim() || undefined,
      term,
      title: String(data.get('title') || '').trim() || undefined,
      excludedDates: [...new Set(String(data.get('excludedDates') || '').split(/[\s,\uFF0C]+/).filter(Boolean))],
    };
    // Clear the DOM immediately and remount fields to discard their internal value state.
    for (const name of ['accessToken', 'refreshToken']) {
      (form.elements.namedItem(name) as HTMLInputElement).value = '';
      data.delete(name);
    }
    setCredentialVersion(version => version + 1);
    setError(null);
    if (!request.accessToken) {
      setError("errors.accessRequired");
      return;
    }
    if (!lookup && !rotate && !/^\d{4}[123]$/.test(request.term)) {
      setError("errors.invalidTerm");
      return;
    }
    if (!lookup && !rotate && request.excludedDates?.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      setError("errors.invalidDates");
      return;
    }
    inFlight.current = true;
    setPending(true);
    setPendingAction(lookup ? 'lookup' : rotate ? 'rotate' : 'sync');
    onPendingChange?.(true);
    try {
      const response = await fetch(lookup ? '/api/calendars/lookup' : snapshot ? `/api/calendars/${encodeURIComponent(snapshot.id)}/${rotate ? 'rotate' : 'sync'}` : '/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(managementToken ? { Authorization: `Bearer ${managementToken}` } : {}) },
        body: JSON.stringify(lookup || rotate ? { accessToken: request.accessToken, refreshToken: request.refreshToken } : request),
        cache: 'no-store',
      });
      if (lookup) {
        onLookup!((await readResponse<LookupResponse>(response)).calendars);
        return;
      }
      if (rotate) {
        onRotate!(await readResponse<CalendarSnapshot>(response));
        setConfirmRotate(false);
        return;
      }
      const result = await readResponse<SyncResponse>(response);
      onSuccess(result);
    } catch (cause) {
      setError(cause instanceof RequestFailure ? cause.translation : rotate ? "errors.rotationUnknownSchool" : "errors.connection");
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
          <Label>{t("form.term")}</Label>
          <Select.Trigger><Select.Value>{termLabel(term, locale)}</Select.Value><Select.Indicator /></Select.Trigger>
          <Description>{t("form.termHelp")}</Description>
          <Select.Popover><ListBox key={locale}>{[...new Set([...termOptions(snapshot?.term), ...(snapshot?.semesters.map(semester => semester.term) ?? [])])].sort().reverse().map(value => <ListBox.Item id={value} key={value} textValue={termLabel(value, locale)}><Label>{termLabel(value, locale)}</Label><ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
        </Select>
        <TextField name="title" defaultValue={snapshot?.title || ''}>
          <Label>{t("form.calendarName")} <span className="font-normal text-muted">{t("common.optional")}</span></Label>
          <Input variant="secondary" maxLength={100} placeholder={t("form.namePlaceholder")} />
          <Description>{t("form.nameHelp")}</Description>
        </TextField>
      </div>
      <div className="space-y-5 border-t border-border/70 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">{t("form.connect")}</h3>
          <Link to="/guide" search={{ lang: locale }} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent">{t("form.tokenGuide")} <ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>
        </div>
        <TextField key={`access-${credentialVersion}`} name="accessToken" isRequired autoComplete="off">
          <Label>{t("form.accessLabel")}</Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder={t("form.accessPlaceholder")} data-1p-ignore="true" data-lpignore="true" />
        </TextField>
        <TextField key={`refresh-${credentialVersion}`} name="refreshToken" autoComplete="off">
          <Label>{t("form.refreshLabel")} <span className="font-normal text-muted">{t("common.optional")}</span></Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder={t("form.refreshPlaceholder")} data-1p-ignore="true" data-lpignore="true" />
          <Description>{t("form.refreshHelp")}</Description>
        </TextField>
      </div>
      <details key={term} className="border-t border-border/70 pt-3" open={excludedDates.length ? true : undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">{t("form.skipDates")} <span className="text-xs font-normal text-muted">{t("form.optionalExpand")}</span></summary>
        <TextField name="excludedDates" defaultValue={excludedDates.join('\n')} className="mt-3">
          <Label>{t("form.excludedDates")}</Label>
          <TextArea variant="secondary" rows={4} placeholder={'2026-11-26\n2026-11-27'} spellCheck={false} />
          <Description>{t("form.excludedDatesHelp")}</Description>
        </TextField>
      </details>
    </fieldset>
    {error && <Notice error>{t(error, { lng: 'en' })}</Notice>}
    <div>
      <Button type="submit" size="lg" fullWidth isPending={pending && pendingAction === 'sync'} isDisabled={pending}>
        {pending && pendingAction === 'sync' ? <><Spinner size="sm" color="current" />{t("form.reading")}</> : <>{snapshot ? t("form.updateSemester") : t("form.createOrUpdate")}<ArrowRightIcon size={18} aria-hidden="true" /></>}
      </Button>
      {onLookup && <Button type="submit" name="action" value="lookup" variant="secondary" fullWidth className="mt-3" isPending={pending && pendingAction === 'lookup'} isDisabled={pending}>{pending && pendingAction === 'lookup' ? t("form.finding") : t("form.openExisting")}</Button>}
      {onLookup && <p className="mt-3 text-xs leading-5 text-muted">{t("form.lookupHelp")}</p>}
      {onRotate && <div className="mt-4 border-t border-border/70 pt-4">{confirmRotate ? <><p className="text-sm leading-6" role="alert">{t("rotation.confirmSchool")}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="submit" name="action" value="rotate" variant="danger" isPending={pending && pendingAction === 'rotate'} isDisabled={pending}>{t("rotation.confirm")}</Button><Button type="button" variant="secondary" isDisabled={pending} onPress={() => setConfirmRotate(false)}>{t("common.cancel")}</Button></div></> : <Button type="button" variant="ghost" isDisabled={pending} onPress={() => setConfirmRotate(true)}>{t("rotation.action")}</Button>}</div>}
      <p className="mt-3 flex items-start justify-center gap-1.5 text-xs leading-5 text-muted"><LockSimpleIcon size={13} className="mt-0.5 shrink-0" aria-hidden="true" />{t("form.storageNotice")}</p>
    </div>
  </form>;
}

function CreatePage() {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<CalendarSnapshot>();
  const [managementToken, setManagementToken] = useState<string>();
  const [notFound, setNotFound] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState<MessageKey | null>(null);
  function rotated(snapshot: CalendarSnapshot) {
    setSelected(snapshot);
    setStatus("status.linkRotated");
  }
  if (selected) return <>
    <Button variant="ghost" className="mb-6" isDisabled={syncing || rotating} onPress={() => { setSelected(undefined); setManagementToken(undefined); setStatus(null); }}>{t("common.home")}</Button>
    <Intro eyebrow={t("calendar.eyebrow")} title={selected.title}>{t("calendar.updatedSummary", { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(selected.updatedAt)) })}</Intro>
    {status && <div className="mb-6"><Notice>{t(status, { lng: status.startsWith('errors.') ? 'en' : locale })}</Notice></div>}
    <div className="grid items-start gap-7 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={selected} managementToken={managementToken} onRotate={rotated} onPendingChange={setRotating} isDisabled={syncing} /><CourseList snapshot={selected} /></div>
      <Card className="p-6 sm:p-7"><Card.Header className="mb-6"><Card.Title className="flex items-center gap-2 text-lg"><ArrowsClockwiseIcon size={21} aria-hidden="true" />{t("calendar.updateTitle")}</Card.Title><Card.Description>{t("calendar.credentialsHelp")}</Card.Description></Card.Header><Card.Content><fieldset disabled={rotating}><SyncForm key={`${selected.id}:${selected.updatedAt}:${selected.feedUrl}`} snapshot={selected} managementToken={managementToken} onPendingChange={setSyncing} onRotate={managementToken ? undefined : rotated} onSuccess={result => { const { managementToken: _secret, ...snapshot } = result; setSelected(snapshot); setStatus("status.semesterUpdated"); }} /></fieldset></Card.Content></Card>
    </div>
  </>;
  return <>
    <Intro eyebrow={t("home.eyebrow")} title={t("home.title")}>{t("home.description")}</Intro>
    <div className="grid items-start gap-9 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
      <div className="space-y-7">
      {notFound && <Notice>{t("calendar.notFound")}</Notice>}
      <Card className="p-6 sm:p-8">
        <Card.Header className="mb-6"><Card.Title className="text-lg">{t("form.createOrUpdate")}</Card.Title><Card.Description>{t("home.formDescription")}</Card.Description></Card.Header>
        <Card.Content><SyncForm onLookup={calendars => { setSelected(calendars[0]); setManagementToken(undefined); setNotFound(calendars.length === 0); setStatus(null); window.scrollTo({ top: 0 }); }} onSuccess={result => { const { managementToken: token, ...snapshot } = result; setSelected(snapshot); setManagementToken(token); setStatus("status.calendarSaved"); window.scrollTo({ top: 0 }); }} /></Card.Content>
      </Card>
      </div>
      <aside className="space-y-8 lg:pt-3">
        <HowItWorks />
        <div className="border-t border-border/80 pt-7"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheckIcon size={21} className="text-accent" aria-hidden="true" />{t("home.privacyTitle")}</div><p className="text-sm leading-7 text-muted">{t("home.privacyDescription")}</p></div>
        <Link to="/guide" search={{ lang: locale }} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent">{t("home.guideLink")} <ArrowRightIcon size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </>;
}

function HowItWorks() {
  const { locale, t } = useLocale();
  return <section aria-labelledby="how-it-works"><h2 id="how-it-works" className="mb-6 text-sm font-semibold">{t("steps.title")}</h2><ol className="space-y-6">
    {[
      [t("steps.credentialsTitle"), t("steps.credentialsDescription")],
      [t("steps.createTitle"), t("steps.createDescription")],
      [t("steps.subscribeTitle"), t("steps.subscribeDescription")],
    ].map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-default text-xs font-semibold text-muted">{index + 1}</span><div><h3 className="text-sm font-medium leading-7">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div></li>)}
  </ol><p className="mt-7 text-xs leading-6 text-muted">{t("steps.refreshNotice")}</p></section>;
}

function CopyField({ label, value, privateLink = false }: { label: string; value: string; privateLink?: boolean }) {
  const { locale, t } = useLocale();
  const [status, setStatus] = useState<MessageKey | null>(null);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus("status.copied"); }
    catch { setStatus("errors.clipboard"); }
  }
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={privateLink ? 'management-link' : 'subscription-link'}>{label}</label>
    <div className="flex gap-2"><Input id={privateLink ? 'management-link' : 'subscription-link'} aria-label={label} readOnly value={value} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" /><Button variant="secondary" aria-label={t("common.copyLabel", { label })} onPress={copy}><CopyIcon size={17} aria-hidden="true" /><span className="hidden sm:inline">{t("common.copy")}</span></Button></div>
    <p className="text-xs leading-5 text-muted" role="status">{status ? t(status, { lng: status.startsWith('errors.') ? 'en' : locale }) : (privateLink ? t("links.managementPrivacy") : t("links.feedPrivacy"))}</p>
  </div>;
}

function SubscriptionLinks({ snapshot, managementToken, onRotate, onPendingChange, isDisabled = false }: { snapshot: CalendarSnapshot; managementToken?: string; onRotate?: (snapshot: CalendarSnapshot) => void; onPendingChange?: (pending: boolean) => void; isDisabled?: boolean }) {
  const { locale, t } = useLocale();
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const inFlight = useRef(false);
  const feed = new URL(snapshot.feedUrl, window.location.origin).href;
  const manage = managementToken ? `${window.location.origin}/manage/${encodeURIComponent(snapshot.id)}#${managementToken}` : '';
  async function rotate() {
    if (inFlight.current || isDisabled || !managementToken || !onRotate) return;
    inFlight.current = true;
    setRotating(true);
    onPendingChange?.(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendars/${encodeURIComponent(snapshot.id)}/rotate`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${managementToken}` }, body: '{}', cache: 'no-store' });
      onRotate(await readResponse<CalendarSnapshot>(response));
      setConfirmRotate(false);
    } catch (cause) { setError(cause instanceof RequestFailure ? cause.translation : "errors.rotationUnknownManagement"); }
    finally { inFlight.current = false; setRotating(false); onPendingChange?.(false); }
  }
  return <Card className="p-6 sm:p-7"><Card.Header><Card.Title className="text-lg">{t("steps.subscribeTitle")}</Card.Title><Card.Description>{t("links.description")}</Card.Description></Card.Header><Card.Content className="mt-5 space-y-6">
    <CopyField key={feed} label={t("links.feedLabel")} value={feed} />
    <a className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent" href={feed.replace(/^https?:/, 'webcal:')}><CalendarBlankIcon size={19} aria-hidden="true" />{t("links.openApp")} <ArrowSquareOutIcon size={15} aria-hidden="true" /></a>
    {managementToken && <div className="border-t border-border/70 pt-6">
      <CopyField label={t("links.managementLabel")} value={manage} privateLink />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={manage} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-accent">{t("links.openManagement")} <ArrowRightIcon size={15} aria-hidden="true" /></a>
      </div>
    </div>}
    {managementToken && onRotate && <div className="border-t border-border/70 pt-4">{error && <Notice error>{t(error, { lng: 'en' })}</Notice>}{confirmRotate ? <><p className="text-sm leading-6" role="alert">{t("rotation.confirmManagement")}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="danger" isPending={rotating} isDisabled={rotating || isDisabled} onPress={rotate}>{t("rotation.confirm")}</Button><Button variant="secondary" isDisabled={rotating} onPress={() => setConfirmRotate(false)}>{t("common.cancel")}</Button></div></> : <Button variant="ghost" isDisabled={isDisabled} onPress={() => setConfirmRotate(true)}>{t("rotation.action")}</Button>}</div>}
  </Card.Content></Card>;
}

function CourseList({ snapshot }: { snapshot: CalendarSnapshot }) {
  const { locale, t } = useLocale();
  const formatDate = (date: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
  const weekdays = t('courses.weekdays', { returnObjects: true }) as string[];
  return <Card className="p-6 sm:p-7"><Card.Header><div className="flex items-center justify-between gap-3"><Card.Title className="text-lg">{t("courses.title")}</Card.Title><span className="text-sm text-muted">{t('courses.count', { count: snapshot.courseCount })}</span></div><Card.Description>{t("courses.timeZone")}</Card.Description></Card.Header><Card.Content className="mt-4">
    {snapshot.semesters.map(semester => <section key={semester.term} className="mb-7 last:mb-0"><h3 className="mb-4 text-base font-semibold">{termLabel(semester.term, locale)}</h3>
    {semester.warnings.length > 0 && <div className="mb-5"><Notice><p className="font-medium">{t("diagnostics.scheduleNotes", { lng: 'en' })}</p><ul className="mt-1 list-inside list-disc">{semester.warnings.map((warning, index) => <li key={index}>{localizeWarning(warning, locale)}</li>)}</ul></Notice></div>}
    {semester.courses.length === 0 ? <p className="py-5 text-sm leading-6 text-muted">{t("diagnostics.emptySemester", { lng: 'en' })}</p> : <ul className="divide-y divide-border/70">{semester.courses.map(course => <li key={course.id} className="py-5 first:pt-1 last:pb-1"><p className="text-xs font-medium tracking-wide text-accent">{course.code}{course.section ? ` · ${course.section}` : ''}</p><h3 className="mt-1 text-base font-medium">{course.title}</h3>{course.meetings.length ? <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted">{course.meetings.map(meeting => <li key={meeting.id}><p>{meeting.days.map(day => weekdays[day]).join(t("common.listSeparator"))} · {meeting.startTime.slice(0, 5)}–{meeting.endTime.slice(0, 5)}</p><p className="text-xs">{meeting.location || t("diagnostics.locationPending", { lng: 'en' })} · {formatDate(meeting.startDate)} {t("common.rangeSeparator")} {formatDate(meeting.endDate)}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted">{t("diagnostics.meetingsPending", { lng: 'en' })}</p>}</li>)}</ul>}
    {semester.excludedDates.length > 0 && <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-6 text-muted">{t("courses.excludedDates", { dates: semester.excludedDates.map(formatDate).join(t("common.listSeparator")) })}</p>}
    </section>)}
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
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState<MessageKey | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const query = useQuery({
    queryKey: ['calendar', id],
    queryFn: async ({ signal }) => readResponse<CalendarSnapshot>(await fetch(`/api/calendars/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${managementToken}` }, signal, cache: 'no-store' })),
    enabled: Boolean(managementToken) && !deleted,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  async function remove() {
    if (deleting || syncing || rotating) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendars/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managementToken}` } });
      if (!response.ok) throw new RequestFailure(failure(response.status));
      setDeleted(true);
      queryClient.removeQueries({ queryKey: ['calendar', id] });
    } catch { setError("errors.revocation"); }
    finally { setDeleting(false); }
  }
  if (deleted) return <><Intro eyebrow={t("manage.removedEyebrow")} title={t("manage.revokedTitle")}>{t("manage.revokedDescription")}</Intro><Link to="/" search={{ lang: locale }} className="inline-flex min-h-11 items-center gap-2 text-accent">{t("manage.createNew")} <ArrowRightIcon size={17} /></Link></>;
  if (!managementToken) return <><Intro eyebrow={t("manage.privateEyebrow")} title={t("manage.fullLinkTitle")}>{t("manage.fullLinkDescription")}</Intro><Link to="/guide" search={{ lang: locale }} className="inline-flex min-h-11 items-center text-accent">{t("common.guide")}</Link></>;
  if (query.isPending || query.isFetching) return <div aria-busy="true" aria-label={t("manage.loadingLabel")} className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-5 w-4/5 max-w-xl" /><Skeleton className="mt-10 h-96 w-full max-w-2xl rounded-3xl" /><p role="status" className="text-sm text-muted">{t("manage.loading")}</p></div>;
  if (query.isError || !query.data) return <><Intro eyebrow={t("errors.unavailableLabel", { lng: 'en' })} title={t("errors.unavailableTitle", { lng: 'en' })}>{query.error instanceof TypeError ? t("errors.network", { lng: 'en' }) : query.error instanceof RequestFailure ? t(query.error.translation, { lng: 'en' }) : t("errors.managementLink", { lng: 'en' })}</Intro><Button variant="secondary" onPress={() => query.refetch()} isPending={query.isFetching}>{t("common.reload")}</Button></>;
  const snapshot = query.data;
  return <>
    <Intro eyebrow={t("calendar.eyebrow")} title={snapshot.title}>{t("calendar.managedUpdatedSummary", { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(snapshot.updatedAt)) })}</Intro>
    {status && <div className="mb-6"><Notice>{t(status, { lng: status.startsWith('errors.') ? 'en' : locale })}</Notice></div>}
    <div className="grid items-start gap-7 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={snapshot} managementToken={managementToken} isDisabled={syncing || deleting} onPendingChange={setRotating} onRotate={result => { queryClient.setQueryData(['calendar', id], result); setStatus("status.linkRotated"); }} /><CourseList snapshot={snapshot} /></div>
      <div className="space-y-7">
        <Card className="p-6 sm:p-7"><Card.Header className="mb-6"><Card.Title className="flex items-center gap-2 text-lg"><ArrowsClockwiseIcon size={21} aria-hidden="true" />{t("manage.updateTitle")}</Card.Title><Card.Description>{t("manage.updateDescription")}</Card.Description></Card.Header><Card.Content><fieldset disabled={deleting || rotating}><SyncForm key={`${snapshot.updatedAt}:${snapshot.feedUrl}`} snapshot={snapshot} managementToken={managementToken} onPendingChange={setSyncing} onSuccess={result => { const { managementToken: _secret, ...safeSnapshot } = result; queryClient.setQueryData(['calendar', id], safeSnapshot); setStatus("status.coursesUpdated"); }} /></fieldset></Card.Content></Card>
        <section className="px-2"><h2 className="text-sm font-medium">{t("manage.revokeTitle")}</h2><p className="mt-2 text-xs leading-6 text-muted">{t("manage.revokeDescription")}</p>{error && <div className="mt-3"><Notice error>{t(error, { lng: 'en' })}</Notice></div>}{confirmDelete ? <div className="mt-4 space-y-3"><p className="text-sm" role="alert">{t("manage.revokeQuestion")}</p><div className="flex gap-2"><Button variant="danger" isPending={deleting} isDisabled={deleting || syncing || rotating} onPress={remove}>{t("manage.confirmRevocation")}</Button><Button variant="secondary" isDisabled={deleting} onPress={() => setConfirmDelete(false)}>{t("common.cancel")}</Button></div></div> : <Button className="mt-2" variant="ghost" isDisabled={syncing || rotating} onPress={() => setConfirmDelete(true)}><TrashIcon size={16} aria-hidden="true" />{t("manage.revokeAction")}</Button>}</section>
      </div>
    </div>
  </>;
}

function NotFound() {
  const { locale, t } = useLocale();
  return <><Intro eyebrow="404" title={t("errors.notFoundTitle", { lng: 'en' })}>{t("errors.notFoundDescription", { lng: 'en' })}</Intro><Link to="/" search={{ lang: locale }} className="text-accent">{t("common.home")}</Link></>;
}
const rootRoute = createRootRoute({ validateSearch: (search: Record<string, unknown>): { lang?: 'en' | 'zh-CN' } => ({ lang: search.lang === 'en' || search.lang === 'zh-CN' ? search.lang : undefined }), component: Shell, notFoundComponent: NotFound });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: CreatePage });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/guide', component: GuidePage });
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/$id', component: ManagePage });
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, guideRoute, manageRoute]), scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
