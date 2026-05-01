"use client";

import { Button } from "../ui/button";
import { cn } from "../../src/lib/utils";
import { CheckIcon, CopyIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type HTMLAttributes,
  useContext,
  useState,
} from "react";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({
  code: "",
});

export const CodeBlock = ({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const lines = code.split("\n");

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          "code-block-wrapper group relative w-full overflow-hidden rounded-lg border border-border-subtle bg-surface-2 text-foreground",
          className
        )}
        {...props}
      >
        {/* Header: language label + copy button */}
        <div className="code-block-header flex items-center justify-between px-3 py-1.5 border-b border-border-subtle bg-surface-3/50">
          <span className="text-[11px] font-mono font-medium text-text-dim uppercase tracking-wide select-none">
            {language || "text"}
          </span>
          {children ? (
            <div className="flex items-center gap-1">
              {children}
            </div>
          ) : (
            <CodeBlockCopyButton />
          )}
        </div>

        {/* Code area */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-0">
                  {showLineNumbers && (
                    <td className="w-10 select-none pr-4 text-right align-top text-text-dim text-xs font-mono">
                      {i + 1}
                    </td>
                  )}
                  <td className="p-0">
                    <pre className="m-0 px-3 py-0.5 text-xs whitespace-pre-wrap break-words font-mono leading-5">
                      <code className="text-xs">{line || "\u00A0"}</code>
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 1500,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  return (
    <button
      type="button"
      onClick={copyToClipboard}
      className={cn(
        "code-block-copy-btn inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium transition-all duration-200 cursor-pointer",
        isCopied
          ? "bg-emerald-500/15 text-emerald-600"
          : "text-text-dim hover:text-text-primary hover:bg-surface-hover",
        className
      )}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {isCopied ? (
        <>
          <CheckIcon size={12} />
          <span>已复制</span>
        </>
      ) : (
        <>
          <CopyIcon size={12} />
          <span>复制</span>
        </>
      )}
    </button>
  );
};
