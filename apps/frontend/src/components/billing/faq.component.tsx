'use client';

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { BRAND_NAME } from '@gitroom/react/brand/brand';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
const useFaqList = () => {
  const user = useUser();
  return [
    ...(user?.allowTrial
      ? [
          {
            title: 'When does billing begin?',
            description:
              'Your exact trial length, renewal date, and amount are shown in secure Stripe Checkout before you confirm. Payment-card data is handled by Stripe, not stored by Publishly.',
          },
        ]
      : []),
    {
      title: `How does ${BRAND_NAME} handle source transparency?`,
      description: `${BRAND_NAME} is built on the AGPL-3.0-licensed Postiz engine. The corresponding source for the version running this service is available from the Source page, with upstream attribution preserved.`,
    },
    {
      title: 'What are social connections?',
      description: `A social connection is an account or page you authorize ${BRAND_NAME} to use. Only providers configured by the operator are shown, and platform-specific controls appear only when the provider exposes that capability.`,
    },
    {
      title: 'How do team members work?',
      description:
        'Workspace owners and admins can invite teammates within the active plan seat limit. Roles control whether a member can manage settings, billing, connections, or publishing work.',
    },
  ];
};
export const FAQSection: FC<{
  title: string;
  description: string;
}> = (props) => {
  const { title, description } = props;
  const [show, setShow] = useState(false);
  const changeShow = useCallback(() => {
    setShow(!show);
  }, [show]);
  return (
    <div
      className="bg-sixth p-[24px] border border-tableBorder rounded-[8px] flex flex-col"
      onClick={changeShow}
    >
      <div className={`text-[20px] cursor-pointer flex justify-center`}>
        <div className="flex-1">{title}</div>
        <div className="flex items-center justify-center w-[32px]">
          {!show ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M18 12.75H6C5.59 12.75 5.25 12.41 5.25 12C5.25 11.59 5.59 11.25 6 11.25H18C18.41 11.25 18.75 11.59 18.75 12C18.75 12.41 18.41 12.75 18 12.75Z"
                fill="white"
              />
              <path
                d="M12 18.75C11.59 18.75 11.25 18.41 11.25 18V6C11.25 5.59 11.59 5.25 12 5.25C12.41 5.25 12.75 5.59 12.75 6V18C12.75 18.41 12.41 18.75 12 18.75Z"
                fill="white"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M24 17H8C7.45333 17 7 16.5467 7 16C7 15.4533 7.45333 15 8 15H24C24.5467 15 25 15.4533 25 16C25 16.5467 24.5467 17 24 17Z"
                fill="#ECECEC"
              />
            </svg>
          )}
        </div>
      </div>
      <div
        className={clsx(
          'transition-all duration-500 overflow-hidden',
          !show ? 'max-h-[0]' : 'max-h-[500px]'
        )}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
          }}
          className={`mt-[16px] w-full text-wrap font-[400] text-[16px] text-customColor17 select-text max-w-[450px]`}
          dangerouslySetInnerHTML={{
            __html: description,
          }}
        />
      </div>
    </div>
  );
};
export const FAQComponent: FC = () => {
  const list = useFaqList();
  return (
    <div>
      {/*<h3 className="text-[24px] mt-[48px] mb-[40px] tablet:mt-[80px]">*/}
      {/*  {t('frequently_asked_questions', 'Frequently Asked Questions')}*/}
      {/*</h3>*/}
      <div className="gap-[24px] flex-col flex select-none  mt-[48px] mb-[40px] tablet:mt-[80px]">
        {list.map((item, index) => (
          <FAQSection key={index} {...item} />
        ))}
      </div>
    </div>
  );
};
