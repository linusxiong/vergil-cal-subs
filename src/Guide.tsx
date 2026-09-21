import { Trans } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { ArrowRightIcon, ArrowSquareOutIcon, GithubLogoIcon } from '@phosphor-icons/react';
import { useLocale } from './locale';

const githubUrl = import.meta.env.VITE_GITHUB_URL || 'https://github.com/linusxiong/vergil-cal-subs';

export default function GuidePage() {
  const { locale, t } = useLocale();
  return <div className="max-w-3xl">
    <div className="mb-9 max-w-2xl sm:mb-11">
      <p className="mb-3 text-xs font-semibold tracking-[0.15em] text-muted uppercase">{t("guide.eyebrow")}</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-tight">{t("guide.title")}</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-muted">{t("guide.description")}</p>
    </div>
    <div className="guide space-y-9">
      <section>
        <h2>{t("guide.credentials.title")}</h2>
        <p><Trans i18nKey="guide.credentials.signIn" components={{ vergil: <a href="https://vergil.columbia.edu" target="_blank" rel="noreferrer" aria-label={t("guide.credentials.vergilLabel")} />, external: <ArrowSquareOutIcon size={14} className="inline" aria-hidden="true" /> }} /></p>
        <ol>
          <li>{t("guide.credentials.developerTools")}</li>
          <li><Trans i18nKey="guide.credentials.storage" components={{ strong: <strong /> }} /></li>
          <li><Trans i18nKey="guide.credentials.copyTokens" components={{ code: <code /> }} /></li>
          <li>{t("guide.credentials.submit")}</li>
        </ol>
        <p><Trans i18nKey="guide.credentials.network" components={{ strong: <strong />, code: <code /> }} /></p>
        <p>{t("guide.credentials.refresh")}</p>
        <div role="note" className="rounded-2xl bg-accent/7 px-4 py-3 text-sm leading-6 text-foreground">
          <strong>{t("guide.credentials.protectTitle")}</strong>
          {t("guide.credentials.protectDescription")}
        </div>
      </section>
      <section>
        <h2>{t("guide.subscribe.title")}</h2>
        <p>{t("guide.subscribe.description")}</p>
        <ul>
          <li><strong>{t("guide.subscribe.appleLabel")}</strong>{t("guide.subscribe.apple")}</li>
          <li><strong>{t("guide.subscribe.googleLabel")}</strong>{t("guide.subscribe.google")}</li>
          <li><strong>{t("guide.subscribe.outlookLabel")}</strong>{t("guide.subscribe.outlook")}</li>
        </ul>
        <p>{t("guide.subscribe.refreshNotice")}</p>
      </section>
      <section>
        <h2>{t("guide.manage.title")}</h2>
        <p><Trans i18nKey="guide.manage.save" components={{ strong: <strong /> }} /></p>
        <p>{t("guide.manage.update")}</p>
        <p>{t("guide.manage.lookup")}</p>
        <p>{t("guide.manage.rotate")}</p>
        <p>{t("guide.manage.privacy")}</p>
      </section>
      <section className="border-t border-border/70 pt-7">
        <h2>{t("guide.about.title")}</h2>
        <p>{t("guide.about.description")}</p>
        <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm" aria-label={t("guide.about.sourceLabel")}><GithubLogoIcon size={19} aria-hidden="true" />{t("guide.about.source")} <ArrowSquareOutIcon size={14} aria-hidden="true" /></a>
      </section>
    </div>
    <Link to="/" search={{ lang: locale }} className="mt-8 inline-flex min-h-11 items-center gap-2 font-medium text-accent">{t("guide.createLink")} <ArrowRightIcon size={17} aria-hidden="true" /></Link>
  </div>;
}
