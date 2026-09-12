/** Display-only Kurdish names for listings. Does not change sellers in the database. */
const KURDISH_SELLER_NAMES = [
  'Rebaz Hassan',
  'Dara Salih',
  'Karwan Ali',
  'Rojin Mustafa',
  'Shilan Osman',
  'Azad Ibrahim',
  'Haval Qadir',
  'Berivan Ahmed',
  'Lana Abdullah',
  'Aram Yousif',
  'Vian Mohammed',
  'Soran Khalid',
  'Diyar Amedi',
  'Helin Rashid',
  'Zhiwar Haji',
  'Avin Nuri',
  'Kajin Mahmood',
  'Nian Omer',
  'Lawen Saeed',
  'Barzan Taha',
  'Dashne Karim',
  'Ako Faris',
  'Kwestan Jamil',
  'Sherko Aziz',
] as const;

const DEMO_LISTING_SELLER_NAMES: Record<string, string> = {
  'c98d84f2-1860-49bb-8a7c-34deabf89668': 'Rebaz Hassan',
  '51a2bd31-d1b0-4e2f-8532-6b21f29d7ccf': 'Dara Salih',
  '4d7850b8-1c5a-4706-ba51-0a3ffde31bdc': 'Karwan Ali',
  '7a1abc21-de55-4428-aefa-c6bb5b01bc16': 'Rojin Mustafa',
  '852efa93-b8a5-44ef-8626-52161e0e36d0': 'Shilan Osman',
  '7905e8cc-b2f4-46fd-89c0-315426811a48': 'Azad Ibrahim',
  '153faa06-52d7-45df-a470-48786cd53372': 'Haval Qadir',
  'e5d0cb76-4b3a-4881-935c-7ef6d7425bcc': 'Berivan Ahmed',
  'dc7f4176-d7cd-48f3-aebf-768d42ed97d3': 'Lana Abdullah',
  'd8988428-745c-4931-b427-32bc37fa2185': 'Aram Yousif',
  '2fa4df35-10ea-46d5-9110-e0baa0917695': 'Vian Mohammed',
  '991471c4-886f-4953-8232-e944f9c59826': 'Soran Khalid',
  '6e35ee86-be87-46d3-a0f9-e535a4d6aece': 'Diyar Amedi',
  '7a3dd4c5-03c1-491a-bfef-7059f6d5b8aa': 'Helin Rashid',
  'd1b5411c-1180-411b-a236-4250f975178d': 'Zhiwar Haji',
  '8294ae67-2b82-4cd0-a1fd-fc00301295eb': 'Avin Nuri',
};

function sellerNameFromId(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i += 1) {
    hash = (hash * 31 + productId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % KURDISH_SELLER_NAMES.length;
  return KURDISH_SELLER_NAMES[index];
}

export function demoListingSellerName(productId: string | null | undefined): string | null {
  if (!productId) return null;
  return DEMO_LISTING_SELLER_NAMES[productId] ?? sellerNameFromId(productId);
}
