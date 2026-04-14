"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof DialogPrimitive.Backdrop>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Backdrop
      ref={ref}
      className={cn("fixed inset-0 z-50 bg-black/30", className)}
      {...props}
    />
  );
});

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof DialogPrimitive.Popup>
>(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Popup
          ref={ref}
          className={cn(
            "relative w-full max-w-lg rounded-xl border border-gray-400 bg-background-100 p-6 shadow-lg",
            className
          )}
          {...props}
        >
          {children}
          <DialogClose
            className="absolute right-4 top-4 rounded-md p-1 text-gray-700 transition-colors hover:bg-muted hover:text-gray-1000"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </div>
    </DialogPortal>
  );
});

const DialogHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    className={cn("mb-4 flex flex-col space-y-1.5 text-left", className)}
    {...props}
  />
);

const DialogFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div
    className={cn("mt-5 flex justify-end gap-2", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentProps<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-[16px] font-semibold text-gray-1000", className)}
      {...props}
    />
  );
});

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentProps<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-[13px] text-gray-700", className)}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
