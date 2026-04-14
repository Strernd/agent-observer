"use client";

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DropdownMenu = MenuPrimitive.Root;
const DropdownMenuTrigger = MenuPrimitive.Trigger;
const DropdownMenuPortal = MenuPrimitive.Portal;

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Popup> &
    React.ComponentProps<typeof MenuPrimitive.Positioner>
>(function DropdownMenuContent(
  {
    className,
    sideOffset = 6,
    align = "start",
    side = "bottom",
    children,
    ...props
  },
  ref
) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          ref={ref}
          className={cn(
            "z-50 min-w-44 overflow-hidden rounded-lg border border-gray-300 bg-background-100 p-1 shadow-lg outline-none",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  );
});

const DropdownMenuItem = React.forwardRef<
  HTMLElement,
  React.ComponentProps<typeof MenuPrimitive.Item> & {
    inset?: boolean;
  }
>(function DropdownMenuItem({ className, inset, ...props }, ref) {
  return (
    <MenuPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-gray-1000 outline-none select-none data-[disabled]:pointer-events-none data-[highlighted]:bg-muted data-[disabled]:opacity-50",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  );
});

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Separator
      ref={ref}
      className={cn("-mx-1 my-1 h-px bg-gray-200", className)}
      {...props}
    />
  );
});

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    inset?: boolean;
  }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "px-2 py-1.5 text-[12px] font-medium text-gray-700",
        inset && "pl-8",
        className
      )}
      {...props}
    />
  );
});

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.ComponentProps<"span">) => (
  <span
    className={cn("ml-auto text-[11px] text-gray-600 tracking-wide", className)}
    {...props}
  />
);

const DropdownMenuSubTrigger = React.forwardRef<
  HTMLElement,
  React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger> & {
    inset?: boolean;
  }
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <MenuPrimitive.SubmenuTrigger
      ref={ref}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-gray-1000 outline-none data-[highlighted]:bg-muted",
        inset && "pl-8",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRight className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  );
});

const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof MenuPrimitive.Popup> &
    React.ComponentProps<typeof MenuPrimitive.Positioner>
>(function DropdownMenuSubContent(
  { className, sideOffset = 8, children, ...props },
  ref
) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner sideOffset={sideOffset} side="right" align="start">
        <MenuPrimitive.Popup
          ref={ref}
          className={cn(
            "z-50 min-w-44 overflow-hidden rounded-lg border border-gray-300 bg-background-100 p-1 shadow-lg outline-none",
            className
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
});

const DropdownMenuSub = MenuPrimitive.SubmenuRoot;

const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLElement,
  React.ComponentProps<typeof MenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        "relative flex cursor-default items-center rounded-md py-1.5 pr-2 pl-8 text-[13px] text-gray-1000 outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex size-4 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <Check className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
});

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
