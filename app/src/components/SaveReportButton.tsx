"use client";

// "Save report PDF" (plan section 9): the browser's print dialog with the print stylesheet, where "Save as PDF" is picked.
// Every collapsed review is opened first so it is in the PDF, and the page title becomes the suggested file name.
export function SaveReportButton({ fileName }: { fileName: string }) {
  function save() {
    const closed = [...document.querySelectorAll("details:not([open])")];
    const title = document.title;
    closed.forEach((d) => d.setAttribute("open", ""));
    document.title = fileName;
    const restore = () => {
      closed.forEach((d) => d.removeAttribute("open"));
      document.title = title;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <button type="button" className="btn" onClick={save}>
      Save report PDF
    </button>
  );
}
