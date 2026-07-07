import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://quizgens.tech"),

  title: {
    default: "QuizGens – AI Quiz Generator | Generate MCQs from PDFs",
    template: "%s | QuizGens",
  },

  description:
    "Generate AI-powered MCQs from PDFs in seconds. Upload notes, textbooks, research papers, or study material and create quizzes instantly for exams and revision.",

  keywords: [
    "AI Quiz Generator",
    "PDF Quiz Generator",
    "Generate MCQs from PDF",
    "AI MCQ Generator",
    "Quiz Generator",
    "PDF to Quiz",
    "Exam Preparation",
    "Study Tool",
    "AI Education",
    "QuizGens",
  ],

  authors: [{ name: "Madhav Pratap Singh" }],
  creator: "QuizGens",
  publisher: "QuizGens",
  applicationName: "QuizGens",
  category: "Education",

  alternates: {
    canonical: "https://quizgens.tech",
  },

  verification: {
    google: "ApNU_7-cBH_0QOaESm0zqF4hv6r3STnfKjVNiwfLMA0",
  },

  openGraph: {
    title: "QuizGens – AI Quiz Generator",
    description:
      "Upload PDFs and instantly generate AI-powered MCQs for smarter exam preparation.",
    url: "https://quizgens.tech",
    siteName: "QuizGens",
    locale: "en_US",
    type: "website",

    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "QuizGens",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "QuizGens – AI Quiz Generator",
    description: "Generate AI-powered MCQs from PDFs instantly.",
    images: ["/og-image.png"],
  },

  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },

  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.theme==='dark'||(!('theme' in localStorage)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(_){}`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
