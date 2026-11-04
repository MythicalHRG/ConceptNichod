export const dynamic = 'force-dynamic';

import React from "react";
import { getChangelogsAction, checkIsAdminAction } from "@/app/actions/changelog";
import { ChangelogView } from "@/components/changelog/changelog-view";

export const metadata = {
  title: "Changelog & Updates - ConceptNichod",
  description: "Explore the latest platform updates, features, and improvements in ConceptNichod.",
};

export default async function ChangelogPage() {
  const [changelogsRes, isAdmin] = await Promise.all([
    getChangelogsAction(),
    checkIsAdminAction(),
  ]);

  const changelogs = changelogsRes.changelogs || [];

  return <ChangelogView initialChangelogs={changelogs} isAdmin={isAdmin} />;
}
