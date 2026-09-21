import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowSquareOutIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { useLocale } from './locale';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';

export default function GuidePage() {
  const { t } = useLocale();
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
          <li>{t('Copy the complete values of ', '分别复制 ')}<code>access_token</code>{t(' and ', ' 和 ')}<code>refresh_token</code>{t('. Keep the original text without adding quotes.', ' 的完整值。保留原始文本，不要添加引号。')}</li>
          <li>{t('Return to the create or manage page, paste each token into its field, and submit.', '回到创建或管理页面，粘贴到对应字段并提交。')}</li>
        </ol>
        <p>{t('If those entries are missing from local storage, open ', '如果本地存储没有这两项：打开 ')}<strong>Network</strong>{t(' and sign in again. Find the ', ' 后重新登录，找到 ')}<code>token.oauth2</code>{t(' request, then look for both fields in ', ' 请求，在 ')}<strong>Response</strong>{t('. A response value of ', ' 中查找这两个字段。登录响应中的 ')}<code>expires_in: 7199</code>{t(' means roughly two hours, so use the tokens promptly.', ' 约为两小时；请及时使用。')}</p>
        <div role="note" className="rounded-2xl bg-accent/7 px-4 py-3 text-sm leading-6 text-foreground">
          <strong>{t('Protect tokens like passwords. ', '像保护密码一样保护 Token。')}</strong>
          {t('Do not share screenshots or export or upload HAR files. You do not need to paste any code into the Console. This service only reads your schedule, but university-issued tokens may grant broader access. Use a deployment you trust.', '不要分享截图、导出或上传 HAR，也不需要在 Console 粘贴任何代码。本服务只需读取课表，但学校签发的 Token 可能拥有更广权限；仅在你信任的部署上使用。')}
        </div>
      </section>
      <section>
        <h2>{t('02 · Create and subscribe', '02 · 创建与订阅')}</h2>
        <p>{t('Choose your term from the dropdown, such as Fall 2026. For holidays or canceled classes, enter one date per line under “Skip dates without classes.”', '从下拉菜单选择学期，例如“2026 年秋季”。如有假期或停课安排，在“跳过不上课的日期”中每行填写一个日期。')}</p>
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
        <p>{t('After adding or dropping a course, or when meeting times change, open the manage link and submit two fresh Vergil tokens. The service saves the latest course snapshot, and your subscription URL stays the same. We do not store university tokens, so there is no automatic background sync. A failed update leaves your existing snapshot intact.', '增退选或时间变更后，打开管理链接，重新获取并提交两项学校 Token。服务保存最新课程快照，订阅地址保持不变。我们不保存学校 Token，因此没有后台自动同步；一次读取失败不会覆盖已有快照。')}</p>
        <p>{t('Anyone with the subscription link can view your schedule. If a link is exposed, revoke the subscription and create a new one. A lost manage link cannot be recovered using university tokens; create a new subscription and remove the old one from your calendar app.', '订阅链接本身也具有访问权限：任何持有它的人都能查看课表。若链接泄露，可撤销原订阅并创建新订阅。管理链接丢失后无法通过学校 Token 找回，请新建订阅并在客户端移除旧订阅。')}</p>
      </section>
      <section className="border-t border-border/70 pt-7">
        <h2>{t('Transparent, open, and simple.', '透明、开放，保持简单。')}</h2>
        <p>{t('This is an independent open-source tool with no affiliation to Columbia University. Course data comes from the Vergil information you authorize us to read. Follow official university and instructor announcements for meeting times and cancellations.', '这是一个独立开源工具，与 Columbia University 无隶属关系。课程数据来自你授权读取的 Vergil 信息；时间与停课安排请以学校和授课教师通知为准。')}</p>
        <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm" aria-label={t('Source code and deployment guide on GitHub (opens in a new tab)', '查看 GitHub 源代码与部署说明（在新标签页打开）')}><GithubLogoIcon size={19} aria-hidden="true" />{t('Source code and deployment guide on GitHub', '查看 GitHub 源代码与部署说明')} <ArrowSquareOutIcon size={14} aria-hidden="true" /></a>
      </section>
    </div>
    <Link to="/" className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent">{t('Create a subscription', '开始创建订阅')} <ArrowRightIcon size={17} aria-hidden="true" /></Link>
  </div>;
}
