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
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Google</title>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.73 1.23 9.24 3.25l6.92-6.92C35.92 2.14 30.35 0 24 0 14.6 0 6.51 5.38 2.56 13.22l8.08 6.28C12.64 13.3 17.9 9.5 24 9.5z"
      />
      <path
        fill="#34A853"
        d="M46.5 24.5c0-1.56-.14-3.06-.4-4.5H24v9h12.68c-.55 3-2.2 5.54-4.68 7.25l7.56 5.86C43.82 38.16 46.5 31.8 46.5 24.5z"
      />
      <path
        fill="#4A90E2"
        d="M10.64 28.5a14.56 14.56 0 0 1 0-9l-8.08-6.28A24.01 24.01 0 0 0 0 24c0 3.82.9 7.44 2.56 10.78l8.08-6.28z"
      />
      <path
        fill="#FBBC05"
        d="M24 48c6.35 0 11.67-2.1 15.56-5.89l-7.56-5.86C29.73 37.71 27 38.5 24 38.5c-6.1 0-11.36-3.8-13.36-9l-8.08 6.28C6.51 42.62 14.6 48 24 48z"
      />
    </svg>
  ),
};
