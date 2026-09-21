import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createRootRoute, createRoute, createRouter, Link, Outlet, useLocation } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Description, Input, Label, Skeleton, Spinner, TextArea, TextField } from '@heroui/react';
import { ArrowRightIcon, ArrowSquareOutIcon, ArrowsClockwiseIcon, CalendarBlankIcon, CheckIcon, CopyIcon, GithubLogoIcon, LockSimpleIcon, ShieldCheckIcon, TrashIcon } from '@phosphor-icons/react';
import type { CalendarSnapshot, SyncRequest, SyncResponse } from './shared';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const now = new Date();
const currentTerm = `${now.getFullYear()}${now.getMonth() < 4 ? 1 : now.getMonth() < 8 ? 2 : 3}`;

function failure(status: number): string {
  if (status === 401 || status === 403) return '验证未通过。请检查管理链接，或重新登录 Vergil 并获取两项 Token。';
  if (status === 404) return '找不到这个日历。它可能已被撤销，请检查完整的管理链接。';
  if (status === 429) return '请求过于频繁，请稍后再试。';
  if (status === 400 || status === 422) return '无法处理这些信息。请检查学期、日期与两项 Token 后重试。';
  return '暂时无法连接课程服务，请稍后重试。已有日历内容不会因此被覆盖。';
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(failure(response.status));
  return response.json() as Promise<T>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div role={error ? 'alert' : 'status'} className={`rounded-2xl px-4 py-3 text-sm leading-6 ${error ? 'bg-danger/8 text-danger' : 'bg-accent/7 text-foreground'}`}>{children}</div>;
}

function Shell() {
  return <div className="min-h-screen flex flex-col">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>跳至主要内容</a>
    <header className="border-b border-border/60 bg-surface/80">
      <div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-9">
        <Link to="/" className="flex min-h-11 items-center gap-2.5 font-semibold tracking-tight">
          <CalendarBlankIcon size={24} weight="duotone" className="text-accent" aria-hidden="true" />
          <span>Vergil <span className="font-normal text-muted">Calendar</span></span>
        </Link>
        <nav aria-label="主导航" className="flex items-center gap-4 text-sm sm:gap-7">
          <Link to="/" className="nav-link hidden sm:inline-flex" activeProps={{ 'aria-current': 'page' }}>创建订阅</Link>
          <Link to="/guide" className="nav-link inline-flex" activeProps={{ 'aria-current': 'page' }}>使用指南</Link>
          <a href={githubUrl} className="nav-link inline-flex" target="_blank" rel="noreferrer" aria-label="GitHub 源代码（新窗口）"><GithubLogoIcon size={21} aria-hidden="true" /><span className="hidden sm:inline">GitHub</span></a>
        </nav>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-5 py-10 sm:px-9 sm:py-14"><Outlet /></main>
    <footer className="mx-auto flex w-full max-w-6xl flex-col justify-between gap-3 px-5 pb-7 pt-9 text-xs leading-5 text-muted sm:flex-row sm:px-9">
      <p>为更从容的校园日常。独立开源项目，与 Columbia University 无隶属关系。</p>
      <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 self-start sm:-my-3">查看源代码 <ArrowSquareOutIcon size={13} aria-hidden="true" /></a>
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
  const [pending, setPending] = useState(false);
  const [credentialVersion, setCredentialVersion] = useState(0);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const request: SyncRequest = {
      accessToken: String(data.get('accessToken') || '').trim(),
      refreshToken: String(data.get('refreshToken') || '').trim(),
      term: String(data.get('term') || '').trim(),
      title: String(data.get('title') || '').trim() || undefined,
      excludedDates: [...new Set(String(data.get('excludedDates') || '').split(/[\s,，]+/).filter(Boolean))],
    };
    // Clear the DOM immediately and remount fields to discard their internal value state.
    for (const name of ['accessToken', 'refreshToken']) {
      (form.elements.namedItem(name) as HTMLInputElement).value = '';
      data.delete(name);
    }
    setCredentialVersion(version => version + 1);
    setError('');
    if (!request.accessToken || !request.refreshToken) {
      setError('请填写 Access Token 和 Refresh Token。输入已清空，请重新粘贴两项。');
      return;
    }
    if (!/^\d{4}[123]$/.test(request.term)) {
      setError('学期格式为四位年份 + 1 / 2 / 3，例如 20263。请修正后重新粘贴两项 Token。');
      return;
    }
    if (request.excludedDates?.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      setError('排除日期应为有效的 YYYY-MM-DD 日期，每行一个。请修正后重新粘贴两项 Token。');
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
      if (!snapshot && !result.managementToken) throw new Error('未收到管理链接，请稍后重试。');
      onSuccess(result);
    } catch (cause) {
      setError(cause instanceof TypeError ? '网络连接失败，请检查网络后重试。请重新粘贴两项 Token；已有日历内容保持不变。' : cause instanceof Error ? cause.message : '操作失败，请稍后重试。');
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
        <TextField name="term" defaultValue={snapshot?.term || currentTerm} isRequired>
          <Label>学期</Label>
          <Input variant="secondary" inputMode="numeric" maxLength={5} placeholder="20263" />
          <Description>1 春季 · 2 夏季 · 3 秋季</Description>
        </TextField>
        <TextField name="title" defaultValue={snapshot?.title || ''}>
          <Label>日历名称 <span className="font-normal text-muted">（可选）</span></Label>
          <Input variant="secondary" maxLength={100} placeholder="我的课程表" />
          <Description>方便在日历 App 中辨认</Description>
        </TextField>
      </div>
      <div className="space-y-5 border-t border-border/70 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="text-sm font-semibold">连接 Vergil</h3>
          <Link to="/guide" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent">如何获取 Token <ArrowSquareOutIcon size={14} aria-hidden="true" /></Link>
        </div>
        <TextField key={`access-${credentialVersion}`} name="accessToken" isRequired autoComplete="off">
          <Label>Access Token</Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder="粘贴 access_token" data-1p-ignore="true" data-lpignore="true" />
        </TextField>
        <TextField key={`refresh-${credentialVersion}`} name="refreshToken" isRequired autoComplete="off">
          <Label>Refresh Token</Label>
          <Input variant="secondary" type="password" autoComplete="off" spellCheck={false} placeholder="粘贴 refresh_token" data-1p-ignore="true" data-lpignore="true" />
          <Description>两项均必填。提交后立即清空输入，不保存学校 Token。</Description>
        </TextField>
      </div>
      <details className="border-t border-border/70 pt-3" open={snapshot?.excludedDates.length ? true : undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium">跳过不上课的日期 <span className="text-xs font-normal text-muted">可选 ＋</span></summary>
        <TextField name="excludedDates" defaultValue={snapshot?.excludedDates.join('\n') || ''} className="mt-3">
          <Label>排除日期</Label>
          <TextArea variant="secondary" rows={4} placeholder={'2026-11-26\n2026-11-27'} spellCheck={false} />
          <Description>每行一个 YYYY-MM-DD 日期。请以自己的课程安排为准，系统不会默认排除节假日。</Description>
        </TextField>
      </details>
    </fieldset>
    {error && <Notice error>{error}</Notice>}
    <div>
      <Button type="submit" size="lg" fullWidth isPending={pending} isDisabled={pending}>
        {pending ? <><Spinner size="sm" color="current" />正在读取课程…</> : <>{snapshot ? '更新课程' : '创建日历订阅'}<ArrowRightIcon size={18} aria-hidden="true" /></>}
      </Button>
      <p className="mt-3 flex items-start justify-center gap-1.5 text-xs leading-5 text-muted"><LockSimpleIcon size={13} className="mt-0.5 shrink-0" aria-hidden="true" />仅将课程快照存入日历服务，不保存学校登录凭据。</p>
    </div>
  </form>;
}

function CreatePage() {
  const [created, setCreated] = useState<SyncResponse>();
  if (created) return <>
    <Intro eyebrow="Ready for your calendar" title="课表，准备好了。">订阅一次，即可在常用日历里查看课程。请先保存下方的私密管理链接。</Intro>
    <div className="grid gap-7 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={created} managementToken={created.managementToken!} /><CourseList snapshot={created} /></div>
      <aside className="space-y-5"><Notice><span className="flex items-center gap-2 font-medium"><CheckIcon size={17} />订阅已创建</span><p className="mt-2">学校 Token 输入已清空。选课发生变化后，使用私密管理链接重新读取课程。</p></Notice><HowItWorks /></aside>
    </div>
  </>;
  return <>
    <Intro eyebrow="Your schedule, in sync with your day" title="把课表，放进你的日历。">将 Vergil 课程转换为订阅链接，在 Apple 日历、Google 日历或 Outlook 中轻松查看。</Intro>
    <div className="grid items-start gap-9 lg:grid-cols-[1.5fr_1fr] lg:gap-12">
      <Card className="p-6 sm:p-8">
        <Card.Header className="mb-6"><Card.Title className="text-lg">创建课程订阅</Card.Title><Card.Description>准备好本学期信息和 Vergil 的两项 Token。</Card.Description></Card.Header>
        <Card.Content><SyncForm onSuccess={result => { setCreated(result); window.scrollTo({ top: 0 }); }} /></Card.Content>
      </Card>
      <aside className="space-y-8 lg:pt-3">
        <HowItWorks />
        <div className="border-t border-border/80 pt-7"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldCheckIcon size={21} className="text-accent" aria-hidden="true" />你的凭据，只用于这次读取</div><p className="text-sm leading-7 text-muted">服务只保存生成日历所需的课程快照，不保存学校 Token。Token 仍会经过部署此服务的服务器，请仅使用你信任的部署。</p></div>
        <Link to="/guide" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent">第一次使用？查看完整指南 <ArrowRightIcon size={16} aria-hidden="true" /></Link>
      </aside>
    </div>
  </>;
}

function HowItWorks() {
  return <section aria-labelledby="how-it-works"><h2 id="how-it-works" className="mb-6 text-sm font-semibold">从课程到日常，只需三步</h2><ol className="space-y-6">
    {[
      ['获取 Token', '登录 Vergil，在浏览器开发者工具中复制两项 Token。'],
      ['生成订阅链接', '读取本学期课程，生成与你的日历 App 兼容的链接。'],
      ['添加到日历', '选择“从 URL 订阅”，让课程出现在你习惯的位置。'],
    ].map(([title, description], index) => <li key={title} className="flex gap-4"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-default text-xs font-semibold text-muted">{index + 1}</span><div><h3 className="text-sm font-medium leading-7">{title}</h3><p className="mt-1 text-sm leading-6 text-muted">{description}</p></div></li>)}
  </ol><p className="mt-7 text-xs leading-6 text-muted">课程不会在后台自动同步。更新需再次输入 Token；订阅地址保持不变，日历 App 按自身节奏刷新。</p></section>;
}

function CopyField({ label, value, privateLink = false }: { label: string; value: string; privateLink?: boolean }) {
  const [status, setStatus] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(value); setStatus('已复制'); }
    catch { setStatus('未能自动复制，请选中链接并手动复制。'); }
  }
  return <div className="space-y-2">
    <label className="text-sm font-medium" htmlFor={privateLink ? 'management-link' : 'subscription-link'}>{label}</label>
    <div className="flex gap-2"><Input id={privateLink ? 'management-link' : 'subscription-link'} aria-label={label} readOnly value={value} onFocus={event => event.currentTarget.select()} className="min-w-0 flex-1 font-mono text-xs" /><Button variant="secondary" aria-label={`复制${label}`} onPress={copy}><CopyIcon size={17} aria-hidden="true" /><span className="hidden sm:inline">复制</span></Button></div>
    <p className="text-xs leading-5 text-muted" role="status">{status || (privateLink ? '持有此链接的人可更新或撤销日历，请私密保存。' : '持有订阅链接的人可查看课表，请谨慎分享。')}</p>
  </div>;
}

function SubscriptionLinks({ snapshot, managementToken }: { snapshot: CalendarSnapshot; managementToken: string }) {
  const feed = new URL(snapshot.feedUrl, window.location.origin).href;
  const manage = `${window.location.origin}/manage/${encodeURIComponent(snapshot.id)}#${managementToken}`;
  return <Card className="p-6 sm:p-7"><Card.Header><Card.Title className="text-lg">添加到日历</Card.Title><Card.Description>复制链接，在日历 App 中选择“订阅日历”。</Card.Description></Card.Header><Card.Content className="mt-5 space-y-6">
    <CopyField label="日历订阅链接" value={feed} />
    <a className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-accent" href={feed.replace(/^https?:/, 'webcal:')}><CalendarBlankIcon size={19} aria-hidden="true" />在日历 App 中打开 <ArrowSquareOutIcon size={15} aria-hidden="true" /></a>
    <div className="border-t border-border/70 pt-6"><CopyField label="私密管理链接 · 请保存" value={manage} privateLink /><a href={manage} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm text-accent">打开管理页面 <ArrowRightIcon size={15} aria-hidden="true" /></a></div>
  </Card.Content></Card>;
}

function CourseList({ snapshot }: { snapshot: CalendarSnapshot }) {
  return <Card className="p-6 sm:p-7"><Card.Header><div className="flex items-center justify-between gap-3"><Card.Title className="text-lg">课程概览</Card.Title><span className="text-sm text-muted">{snapshot.courseCount} 门课程</span></div><Card.Description>时间均为 America/New_York（纽约时间）</Card.Description></Card.Header><Card.Content className="mt-4">
    {snapshot.warnings.length > 0 && <div className="mb-5"><Notice><p className="font-medium">请留意以下课程信息</p><ul className="mt-1 list-inside list-disc">{snapshot.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Notice></div>}
    {snapshot.courses.length === 0 ? <p className="py-5 text-sm leading-6 text-muted">本学期没有可显示的课程。请确认学期和 Vergil 中的选课记录。</p> : <ul className="divide-y divide-border/70">{snapshot.courses.map(course => <li key={course.id} className="py-5 first:pt-1 last:pb-1"><p className="text-xs font-medium tracking-wide text-accent">{course.code}{course.section ? ` · ${course.section}` : ''}</p><h3 className="mt-1 text-base font-medium">{course.title}</h3>{course.meetings.length ? <ul className="mt-3 space-y-2.5 text-sm leading-6 text-muted">{course.meetings.map(meeting => <li key={meeting.id}><p>周{meeting.days.map(day => weekdays[day]).join('、')} · {meeting.startTime}–{meeting.endTime}</p><p className="text-xs">{meeting.location || '地点待定'} · {meeting.startDate} 至 {meeting.endDate}</p></li>)}</ul> : <p className="mt-2 text-sm text-muted">尚无确定上课时间，未生成日历事件。</p>}</li>)}</ul>}
    {snapshot.excludedDates.length > 0 && <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-6 text-muted">已跳过的日期：{snapshot.excludedDates.join('、')}</p>}
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
  const queryClient = useQueryClient();
  const [deleted, setDeleted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
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
    setError('');
    try {
      const response = await fetch(`/api/calendars/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${managementToken}` } });
      if (!response.ok) throw new Error(failure(response.status));
      setDeleted(true);
      queryClient.removeQueries({ queryKey: ['calendar', id] });
    } catch { setError('撤销失败，日历仍然保留。请检查网络与管理链接后重试。'); }
    finally { setDeleting(false); }
  }
  if (deleted) return <><Intro eyebrow="Calendar removed" title="订阅已撤销。">服务器上的课程快照已删除，原订阅链接已失效。日历 App 中缓存的事件可能仍需手动移除。</Intro><Link to="/" className="inline-flex min-h-11 items-center gap-2 text-accent">创建新的订阅 <ArrowRightIcon size={17} /></Link></>;
  if (!managementToken) return <><Intro eyebrow="Private calendar" title="需要完整的管理链接。">请打开创建日历时保存的私密管理链接，包含 # 后的管理凭据。订阅链接无法用于管理日历。</Intro><Link to="/guide" className="inline-flex min-h-11 items-center text-accent">查看使用指南</Link></>;
  if (query.isPending || query.isFetching) return <div aria-busy="true" aria-label="正在加载日历" className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-5 w-4/5 max-w-xl" /><Skeleton className="mt-10 h-96 w-full max-w-2xl rounded-3xl" /><p role="status" className="text-sm text-muted">正在加载课程日历…</p></div>;
  if (query.isError || !query.data) return <><Intro eyebrow="Calendar unavailable" title="暂时无法打开日历。">{query.error instanceof TypeError ? '网络连接失败，请检查网络后重试。' : query.error instanceof Error ? query.error.message : '请检查管理链接后重试。'}</Intro><Button variant="secondary" onPress={() => query.refetch()} isPending={query.isFetching}>重新加载</Button></>;
  const snapshot = query.data;
  return <>
    <Intro eyebrow="Your calendar" title={snapshot.title}>最后更新于 {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(snapshot.updatedAt))}（纽约时间）。更新后订阅地址保持不变。</Intro>
    {status && <div className="mb-6"><Notice>{status}</Notice></div>}
    <div className="grid items-start gap-7 lg:grid-cols-[1.3fr_1fr]">
      <div className="space-y-7"><SubscriptionLinks snapshot={snapshot} managementToken={managementToken} /><CourseList snapshot={snapshot} /></div>
      <div className="space-y-7">
        <Card className="p-6 sm:p-7"><Card.Header className="mb-6"><Card.Title className="flex items-center gap-2 text-lg"><ArrowsClockwiseIcon size={21} aria-hidden="true" />更新课程</Card.Title><Card.Description>重新获取两项学校 Token，读取最新课表。日历 App 的刷新可能需要一些时间。</Card.Description></Card.Header><Card.Content><fieldset disabled={deleting}><SyncForm key={snapshot.updatedAt} snapshot={snapshot} managementToken={managementToken} onPendingChange={setSyncing} onSuccess={result => { const { managementToken: _secret, ...safeSnapshot } = result; queryClient.setQueryData(['calendar', id], safeSnapshot); setStatus('课程已更新。订阅链接保持不变，请等待日历 App 刷新。'); }} /></fieldset></Card.Content></Card>
        <section className="px-2"><h2 className="text-sm font-medium">不再需要这个订阅？</h2><p className="mt-2 text-xs leading-6 text-muted">撤销会删除课程快照，使订阅与管理链接失效。此操作无法恢复。</p>{error && <div className="mt-3"><Notice error>{error}</Notice></div>}{confirmDelete ? <div className="mt-4 space-y-3"><p className="text-sm" role="alert">确定撤销这个日历订阅？</p><div className="flex gap-2"><Button variant="danger" isPending={deleting} isDisabled={deleting || syncing} onPress={remove}>确认撤销</Button><Button variant="secondary" isDisabled={deleting} onPress={() => setConfirmDelete(false)}>取消</Button></div></div> : <Button className="mt-2" variant="ghost" isDisabled={syncing} onPress={() => setConfirmDelete(true)}><TrashIcon size={16} aria-hidden="true" />撤销订阅</Button>}</section>
      </div>
    </div>
  </>;
}

function GuidePage() {
  return <div className="max-w-3xl">
    <Intro eyebrow="A little help" title="让课表，自然融入日常。">从获取 Token 到添加订阅，这里是你需要的全部步骤。</Intro>
    <div className="guide space-y-9">
      <section><h2>01 · 获取 Vergil Token</h2><p>在电脑浏览器打开 <a href="https://vergil.columbia.edu" target="_blank" rel="noreferrer">Vergil <ArrowSquareOutIcon size={14} className="inline" aria-hidden="true" /></a>，完成学校登录与 Duo 验证，确认能看到自己的课程。</p><ol><li>打开浏览器开发者工具（Chrome / Edge：⌥⌘I 或 F12）。</li><li>选择 <strong>Application → Local Storage → https://vergil.columbia.edu</strong>。</li><li>分别复制 <code>access_token</code> 和 <code>refresh_token</code> 的完整值。保留原始文本，不要添加引号。</li><li>回到创建或管理页面，粘贴到对应字段并提交。</li></ol><p>如果本地存储没有这两项：打开 <strong>Network</strong> 后重新登录，找到 <code>token.oauth2</code> 请求，在 <strong>Response</strong> 中查找这两个字段。登录响应中的 <code>expires_in: 7199</code> 约为两小时；请及时使用。</p><Notice><strong>像保护密码一样保护 Token。</strong>不要分享截图、导出或上传 HAR，也不需要在 Console 粘贴任何代码。本服务只需读取课表，但学校签发的 Token 可能拥有更广权限；仅在你信任的部署上使用。</Notice></section>
      <section><h2>02 · 创建与订阅</h2><p>学期填写四位年份及季节编号：<code>1</code> 春季、<code>2</code> 夏季、<code>3</code> 秋季，例如 <code>20263</code>。如有假期或停课安排，在“跳过不上课的日期”中每行填写一个日期。</p><ul><li><strong>Apple 日历：</strong>点击“在日历 App 中打开”；或在 Mac 日历中选择“文件 → 新建日历订阅”，粘贴链接。</li><li><strong>Google 日历：</strong>在网页端“其他日历”旁点击 +，选择“通过网址”，粘贴 HTTPS 订阅链接。</li><li><strong>Outlook：</strong>选择“添加日历 → 从 Web 订阅”，粘贴 HTTPS 订阅链接。</li></ul><p>请选择“订阅”而非下载导入一次性文件。刷新间隔由日历 App 决定，服务无法强制所有客户端立即更新。</p></section>
      <section><h2>03 · 保存管理链接，按需更新</h2><p>创建后请私密保存<strong>管理链接</strong>。它包含管理凭据，可用于更新课程或撤销订阅；不要把它当作普通订阅链接分享。</p><p>增退选或时间变更后，打开管理链接，重新获取并提交两项学校 Token。服务保存最新课程快照，订阅地址保持不变。我们不保存学校 Token，因此没有后台自动同步；一次读取失败不会覆盖已有快照。</p><p>订阅链接本身也具有访问权限：任何持有它的人都能查看课表。若链接泄露，可撤销原订阅并创建新订阅。管理链接丢失后无法通过学校 Token 找回，请新建订阅并在客户端移除旧订阅。</p></section>
      <section className="border-t border-border/70 pt-7"><h2>透明、开放，保持简单。</h2><p>这是一个独立开源工具，与 Columbia University 无隶属关系。课程数据来自你授权读取的 Vergil 信息；时间与停课安排请以学校和授课教师通知为准。</p><a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm"><GithubLogoIcon size={19} aria-hidden="true" />查看 GitHub 源代码与部署说明 <ArrowSquareOutIcon size={14} aria-hidden="true" /></a></section>
    </div>
    <Link to="/" className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent">开始创建订阅 <ArrowRightIcon size={17} aria-hidden="true" /></Link>
  </div>;
}

const rootRoute = createRootRoute({ component: Shell, notFoundComponent: () => <><Intro eyebrow="404" title="这个页面不存在。">返回首页，创建你的课程日历订阅。</Intro><Link to="/" className="text-accent">返回首页</Link></> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: CreatePage });
const guideRoute = createRoute({ getParentRoute: () => rootRoute, path: '/guide', component: GuidePage });
const manageRoute = createRoute({ getParentRoute: () => rootRoute, path: '/manage/$id', component: ManagePage });
export const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute, guideRoute, manageRoute]), scrollRestoration: true });
declare module '@tanstack/react-router' { interface Register { router: typeof router } }
