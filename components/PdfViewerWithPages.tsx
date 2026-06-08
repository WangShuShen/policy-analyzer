"use client";

import { FileText } from "lucide-react";

interface Props {
  pdfUrl: string;
  currentPage?: number;
  onTotalPages?: (n: number) => void;
}

export default function PdfViewerWithPages({ pdfUrl, currentPage = 1 }: Props) {
  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-stone-400 px-8">
        <FileText className="h-12 w-12 text-stone-300" />
        <p className="text-sm font-medium text-stone-500">尚未指定 PDF</p>
      </div>
    );
  }

  const src = `${pdfUrl}#page=${currentPage}`;

  return (
    <iframe
      key={src}
      src={src}
      className="w-full h-full border-0"
      title="保單 PDF"
    />
  );
}
