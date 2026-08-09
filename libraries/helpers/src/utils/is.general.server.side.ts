export const isGeneralServerSide = () => {
  return !!process.env.IS_GENERAL;
};

// Product name for server components/metadata. The old Postiz/Gitroom split is
// gone - both modes carry the deployment brand.
export const productNameServerSide = () => {
  return process.env.NEXT_PUBLIC_BRAND_NAME || 'Publishly';
};
