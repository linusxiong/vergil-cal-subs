import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowSquareOutIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { useLocale } from './locale';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';

export default function GuidePage() {
  const { locale, t } = useLocale();
  return <div className="max-w-3xl">
    <div className="mb-9 max-w-2xl sm:mb-11">
      <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-muted uppercase">{t('A little help', '使用指南')}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-tight">{t('Make room for your schedule.', '让课表，自然融入日常。')}</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted">{t('Everything you need, from finding your tokens to subscribing in your calendar.', '从获取 Token 到添加订阅，这里是你需要的全部步骤。')}</p>
    </div>
    <div className="guide space-y-9">
      <section>
        <h2>{t('01 · Get your Vergil tokens', '01 · 获取 Vergil Token')}</h2>
        <p>{t('Open ', '在电脑浏览器打开 ')}<a href="https://vergil.columbia.edu" target="_blank" rel="noreferrer" aria-label={t('Vergil (opens in a new tab)', 'Vergil（在新标签页打开）')}>Vergil <ArrowSquareOutIcon size={14} className="inline" aria-hidden="true" /></a>{t(' in a desktop browser. Sign in with your university account, complete Duo verification, and check that you can see your courses.', '，完成学校登录与 Duo 验证，确认能看到自己的课程。')}</p>
        <ol>
          <li>{t('Open developer tools (Chrome / Edge: ⌥⌘I on Mac, or F12 on Windows).', '打开浏览器开发者工具（Chrome / Edge：Mac 按 ⌥⌘I，Windows 按 F12）。')}</li>
          <li>{t('Choose ', '选择 ')}<strong>Application → Local Storage → https://vergil.columbia.edu</strong>{t('.', '。')}</li>
          <li>{t('Copy the complete value of ', '复制 ')}<code>access_token</code>{t(' (required) and, optionally, ', ' 的完整值（必填）；也可以复制 ')}<code>refresh_token</code>{t(' from the same session. Keep the original text without adding quotes.', '（可选，须来自同一会话）。保留原始文本，不要添加引号。')}</li>
          <li>{t('Return to the create or manage page, paste your Access Token and any optional Refresh Token, and submit. Both fields clear on every submission, including lookup; paste the tokens you want to use again for each request.', '回到创建或管理页面，粘贴 Access Token 和可选的 Refresh Token 后提交。两个输入框会在每次提交时清空，包括查找订阅；下次请求请重新粘贴需要使用的 Token。')}</li>
        </ol>
        <p>{t('If the Access Token or optional Refresh Token is missing from local storage, open ', '如果本地存储没有 Access Token 或可选的 Refresh Token：打开 ')}<strong>Network</strong>{t(' and sign in again. Find the ', ' 后重新登录，找到 ')}<code>token.oauth2</code>{t(' request, then look for the required access_token and optional refresh_token fields in ', ' 请求，在 ')}<strong>Response</strong>{t('. A response value of ', ' 中查找必填的 access_token 和可选的 refresh_token。登录响应中的 ')}<code>expires_in: 7199</code>{t(' means roughly two hours, so use the tokens promptly.', ' 约为两小时；请及时使用。')}</p>
        <p>{t('A Refresh Token is optional. Only after an upstream HTTP 401 can it be used for at most one refresh during the same request. If your Access Token has expired and no Refresh Token was provided, the request returns 401; get a fresh Access Token from Vergil and submit again. Tokens are not persisted, including any returned by a refresh.', 'Refresh Token 可选，仅在上游返回 HTTP 401 后用于同一次请求中最多一次刷新。如果 Access Token 已过期且未提供 Refresh Token，请求会返回 401；请从 Vergil 获取新的 Access Token 后重新提交。所有 Token 均不会持久保存，包括刷新返回的 Token。')}</p>
        <div role="note" className="rounded-2xl bg-accent/7 px-4 py-3 text-sm leading-6 text-foreground">
          <strong>{t('Protect tokens like passwords. ', '像保护密码一样保护 Token。')}</strong>
          {t('Do not share screenshots or export or upload HAR files. You do not need to paste any code into the Console. This service only reads your schedule, but university-issued tokens may grant broader access. Use a deployment you trust.', '不要分享截图、导出或上传 HAR，也不需要在 Console 粘贴任何代码。本服务只需读取课表，但学校签发的 Token 可能拥有更广权限；仅在你信任的部署上使用。')}
        </div>
      </section>
      <section>
        <h2>{t('02 · Create and subscribe', '02 · 创建与订阅')}</h2>
        <p>{t('Choose your term from the dropdown, such as Fall 2026. Each verified UNI has one calendar; submitting again updates it instead of creating another. For holidays or canceled classes, enter one date per line under “Skip dates without classes.”', '从下拉菜单选择学期，例如“2026 年秋季”。每个经验证的 UNI 只有一个日历，再次提交会更新已有日历，不会另建一个。如有假期或停课安排，在“跳过不上课的日期”中每行填写一个日期。')}</p>
        <ul>
          <li><strong>{t('Apple Calendar: ', 'Apple 日历：')}</strong>{t('Click “Open in calendar app,” or choose File → New Calendar Subscription in Calendar on Mac and paste the link.', '点击“在日历 App 中打开”；或在 Mac 日历中选择“文件 → 新建日历订阅”，粘贴链接。')}</li>
          <li><strong>{t('Google Calendar: ', 'Google 日历：')}</strong>{t('On the website, click + next to “Other calendars,” choose “From URL,” and paste the HTTPS subscription link.', '在网页端“其他日历”旁点击 +，选择“通过网址”，粘贴 HTTPS 订阅链接。')}</li>
          <li><strong>{t('Outlook: ', 'Outlook：')}</strong>{t('Choose Add calendar → Subscribe from web and paste the HTTPS subscription link.', '选择“添加日历 → 从 Web 订阅”，粘贴 HTTPS 订阅链接。')}</li>
        </ul>
        <p>{t('Subscribe to the calendar instead of importing a one-time download. Your calendar app controls refresh timing; this service cannot force an immediate update in every app.', '请选择“订阅”而非下载导入一次性文件。刷新间隔由日历 App 决定，服务无法强制所有客户端立即更新。')}</p>
      </section>
      <section>
        <h2>{t('03 · Save your manage link and update when needed', '03 · 保存管理链接，按需更新')}</h2>
        <p>{t('After creating a subscription, save your ', '创建后请私密保存')}<strong>{t('private manage link', '管理链接')}</strong>{t(' somewhere safe. It contains credentials that let you update courses or revoke the subscription. Do not share it as a regular subscription link.', '。它包含管理凭据，可用于更新课程或撤销订阅；不要把它当作普通订阅链接分享。')}</p>
        <p>{t('After adding or dropping a course, or when meeting times change, open the manage link and submit a fresh Access Token and, optionally, a Refresh Token. Choose the term to import: its new snapshot replaces only that term, while previously imported semesters remain in the same calendar feed. Past terms are not fetched automatically. Ordinary updates keep your subscription URL; only explicitly replacing the URL changes it. We do not store university tokens, so there is no automatic background sync. A failed update leaves your existing snapshot intact.', '增退选或时间变更后，打开管理链接，重新获取并提交 Access Token，可选择同时提供 Refresh Token。请选择要导入的学期：新快照只替换该学期，之前导入的其他学期保留在同一日历中；不会自动获取所有往期学期。普通更新保留订阅地址，只有主动更换地址才会改变。我们不保存学校 Token，因此没有后台自动同步；一次读取失败不会覆盖已有快照。')}</p>
        <p>{t('To find an existing calendar, enter a fresh Access Token and an optional Refresh Token on the homepage, then choose “Open existing calendar.” The server verifies your UNI with the university and matches its hash to your unique calendar, which opens automatically if found. Lookup alone does not change any saved courses. Both token fields clear after lookup, so enter a fresh Access Token and any optional Refresh Token again to update your calendar or replace its subscription URL. Ordinary updates preserve both links; replacing the subscription URL keeps the management link. Lookup returns zero or one normalized calendar snapshot and its imported term history, never school tokens or management keys; no plaintext UNI or school tokens are retained.', '查找已有日历时，在首页输入新的 Access Token 和可选的 Refresh Token，点击“打开已有日历”。服务器向学校验证 UNI，再用其哈希匹配你唯一的日历；找到后自动打开，查找本身不会改动已保存的课程。查找后两个 Token 输入框都会清空，更新日历或更换订阅地址前，请再次输入新的 Access Token 和可选的 Refresh Token。普通更新保留两种链接，更换订阅地址时管理链接不变。查找返回零个或一个归一化日历快照及其已导入学期历史，不返回学校 Token 或管理密钥；不保留明文 UNI 或学校 Token。')}</p>
        <p>{t('Replacing the subscription URL requires confirmation: the old URL immediately returns 404, and you must subscribe again in your calendar app using the new URL. Authorize replacement with the saved management key or a fresh Access Token and optional Refresh Token. Saved courses, imported semesters, and the management link remain unchanged; copies already cached by calendar apps cannot be removed this way.', '更换订阅地址前需要确认：旧地址立即返回 404，必须在日历 App 中使用新地址重新订阅。可使用保存的管理密钥，或新的 Access Token 和可选的 Refresh Token 授权更换。已保存的课程、历史学期和管理链接不变；此操作无法删除日历 App 已缓存的副本。')}</p>
        <p>{t('Anyone with the subscription link can view your schedule. If only the subscription URL is exposed, replace it to keep your courses. Replacing the feed URL does not invalidate a leaked management key; if that key leaks, revoke the calendar using the original management link. The original management key cannot be recovered because only its hash is stored. If you lose it, “Open existing calendar” lets you find and update your calendar or replace its subscription URL with a fresh Access Token. Revocation still requires the saved management key.', '订阅链接本身也具有访问权限：任何持有它的人都能查看课表。如果只有订阅地址泄露，可更换地址并保留课程。更换订阅地址不会使泄露的管理密钥失效；若管理密钥泄露，请使用原管理链接撤销日历。原管理密钥仅保存哈希，无法恢复原文。遗失后可通过“打开已有日历”，使用新的 Access Token 查找和更新日历或更换订阅地址；撤销仍需要保存的管理密钥。')}</p>
      </section>
      <section className="border-t border-border/70 pt-7">
        <h2>{t('Transparent, open, and simple.', '透明、开放，保持简单。')}</h2>
        <p>{t('This is an independent open-source tool with no affiliation to Columbia University. Course data comes from the Vergil information you authorize us to read. Follow official university and instructor announcements for meeting times and cancellations.', '这是一个独立开源工具，与 Columbia University 无隶属关系。课程数据来自你授权读取的 Vergil 信息；时间与停课安排请以学校和授课教师通知为准。')}</p>
        <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm" aria-label={t('Source code and deployment guide on GitHub (opens in a new tab)', '查看 GitHub 源代码与部署说明（在新标签页打开）')}><GithubLogoIcon size={19} aria-hidden="true" />{t('Source code and deployment guide on GitHub', '查看 GitHub 源代码与部署说明')} <ArrowSquareOutIcon size={14} aria-hidden="true" /></a>
      </section>
    </div>
    <Link to="/" search={{ lang: locale }} className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent">{t('Create a subscription', '开始创建订阅')} <ArrowRightIcon size={17} aria-hidden="true" /></Link>
  </div>;
}
