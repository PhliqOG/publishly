import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
      {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
      <ReturnUrlComponent />
      <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
        <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
          <LogoTextComponent />
          <div className="flex">{children}</div>
        </div>
      </div>
      <div className="flex-1 pt-[88px] hidden lg:flex flex-col items-center justify-start px-[40px]">
        <div className="text-center text-[38px] leading-[1.15] font-semibold max-w-[560px]">
          Every channel.
          <br />
          One <span className="text-[#7DD3FC]">calendar</span>.
        </div>
        <div className="text-center text-[18px] text-white/60 mt-[24px] max-w-[460px] leading-[1.6]">
          Plan, schedule, and publish to all your social platforms from a
          single workspace - with previews per network, team approvals, and
          analytics that come straight from the platforms.
        </div>
        <div className="mt-[40px] grid grid-cols-3 gap-[12px] text-[14px] text-white/70 max-w-[520px]">
          <div className="rounded-[8px] bg-white/5 px-[14px] py-[12px] text-center">
            Cross-network scheduling
          </div>
          <div className="rounded-[8px] bg-white/5 px-[14px] py-[12px] text-center">
            Team workspaces
          </div>
          <div className="rounded-[8px] bg-white/5 px-[14px] py-[12px] text-center">
            Real platform analytics
          </div>
        </div>
      </div>
    </div>
  );
}
