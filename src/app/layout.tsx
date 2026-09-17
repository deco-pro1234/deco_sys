import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getSession } from "./actions/auth";
import { getPendingReviewCount } from "./actions/review";
import { getActivityReminderItems, getContractReminderItems, type ReminderItem } from "./actions/reminder";
import { getRecurringReminderItems } from "./actions/recurring";
import { getPluginFlags } from "./actions/settings";
import { DEFAULT_PLUGIN_FLAGS } from "@/lib/plugins";
import TopNav from "./TopNav";
import { getCurrentLocale } from "@/lib/locale";
import ReminderOverview from "@/components/ReminderOverview";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SK11 Finance",
  description: "SK11 finance management system",
  applicationName: "SK11 Finance",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SK11",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1736",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const locale = await getCurrentLocale();
  let pendingCount = 0;
  let pluginFlags = DEFAULT_PLUGIN_FLAGS;
  let reminderOverview: {
    contracts: ReminderItem[];
    activities: ReminderItem[];
    recurring: ReminderItem[];
    contractCount: number;
    activityCount: number;
    recurringCount: number;
  } = {
    contracts: [],
    activities: [],
    recurring: [],
    contractCount: 0,
    activityCount: 0,
    recurringCount: 0,
  };

  try {
    pluginFlags = await getPluginFlags();
  } catch (_e) {
    pluginFlags = DEFAULT_PLUGIN_FLAGS;
  }

  if (session?.isAdmin) {
    try {
      pendingCount = await getPendingReviewCount()
    } catch (_e) {
      pendingCount = 0
    }
  }
  if (session) {
    try {
      const [contracts, activities, recurring] = await Promise.all([
        pluginFlags.contracts ? getContractReminderItems() : Promise.resolve([] as ReminderItem[]),
        pluginFlags.matters ? getActivityReminderItems() : Promise.resolve([] as ReminderItem[]),
        pluginFlags.recurring ? getRecurringReminderItems() : Promise.resolve([] as ReminderItem[]),
      ])
      reminderOverview = {
        contracts,
        activities,
        recurring: recurring as ReminderItem[],
        contractCount: contracts.length,
        activityCount: activities.length,
        recurringCount: (recurring as ReminderItem[]).length,
      }
    } catch (_e) {
      reminderOverview = {
        contracts: [],
        activities: [],
        recurring: [],
        contractCount: 0,
        activityCount: 0,
        recurringCount: 0,
      }
    }
  }
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#F2F2F7]">
        {session && (
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-0 sm:pt-2">
            <TopNav
              session={session}
              pendingCount={pendingCount}
              contractReminderCount={reminderOverview.contractCount}
              activityReminderCount={reminderOverview.activityCount}
              recurringReminderCount={reminderOverview.recurringCount}
              pluginFlags={pluginFlags}
              locale={locale}
            />
          </div>
        )}
        {session && (
          <ReminderOverview
            locale={locale}
            contracts={reminderOverview.contracts}
            activities={reminderOverview.activities}
            recurring={reminderOverview.recurring}
          />
        )}
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 pb-10 mobile-safe-pb sm:px-0 sm:pb-10">
          {children}
        </div>
      </body>
    </html>
  );
}
