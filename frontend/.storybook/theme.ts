import { create } from "storybook/theming/create";

export default create({
  base: "light",

  // Brand
  brandTitle: `<div style="line-height:1.2"><strong style="font-size:14px">Terminandoyo</strong><br/><span style="font-size:11px;opacity:0.6">Storybook</span></div>`,
  brandUrl: "/",
  brandImage: "/tay-logo.svg",
  brandTarget: "_self",

  // Accent colors — blueprint-500
  colorPrimary: "#1a6fa0",
  colorSecondary: "#1a6fa0",
});
