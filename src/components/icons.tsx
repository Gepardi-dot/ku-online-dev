import type { SVGProps } from "react";

export const Icons = {
  logo: (props: SVGProps<SVGSVGElement>) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="hsl(var(--primary))"></path>
      <path d="M2 17l10 5 10-5"></path>
      <path d="M2 12l10 5 10-5"></path>
    </svg>
  ),
  google: (props: SVGProps<SVGSVGElement>) => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Google</title>
      <path
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.6 1.6-4.84 1.6-5.84 0-10.6-4.7-10.6-10.5S6.64 3.72 12.48 3.72c3.32 0 5.4 1.4 6.65 2.55l2.4-2.38C19.49 1.89 16.47 0 12.48 0 5.6 0 0 5.54 0 12.38s5.6 12.38 12.48 12.38c6.93 0 12.13-4.82 12.13-12.03 0-.08-1.5-.2-2.22z"
        fill="#4285F4"
      />
    </svg>
  ),
};
