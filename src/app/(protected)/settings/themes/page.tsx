"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { COLOR_THEMES, useColorTheme } from "@/context/color-theme-context";
import { cn } from "@/lib/utils";

export default function ThemesSettingsPage() {
  const { theme, setTheme } = useTheme();
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <div className="flex flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Themes</h1>
        <p className="text-sm text-muted-foreground">
          Choose how the app looks for you. Saved on this device only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            variant="outline"
            value={theme ? [theme] : []}
            onValueChange={(values) => {
              if (values[0]) setTheme(values[0]);
            }}
          >
            <ToggleGroupItem value="light" aria-label="Light">
              <SunIcon /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="dark" aria-label="Dark">
              <MoonIcon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="system" aria-label="System">
              <MonitorIcon /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Color theme</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {COLOR_THEMES.map((colorThemeOption) => (
              <button
                key={colorThemeOption.id}
                type="button"
                onClick={() => setColorTheme(colorThemeOption.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-muted",
                  colorTheme === colorThemeOption.id &&
                    "border-primary ring-2 ring-primary/30",
                )}
              >
                <span
                  className="size-6 rounded-full border"
                  style={{ backgroundColor: colorThemeOption.swatch }}
                />
                {colorThemeOption.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary button</Button>
            <Badge>Badge</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="preview-switch" defaultChecked />
              <Label htmlFor="preview-switch">Switch</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="preview-checkbox" defaultChecked />
              <Label htmlFor="preview-checkbox">Checkbox</Label>
            </div>
          </div>
          <RadioGroup defaultValue="a" className="flex flex-row gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="a" id="preview-radio-a" />
              <Label htmlFor="preview-radio-a">Option A</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="b" id="preview-radio-b" />
              <Label htmlFor="preview-radio-b">Option B</Label>
            </div>
          </RadioGroup>
          <Progress value={65} className="max-w-sm" />
          <p className="text-xs text-muted-foreground">
            These are the components that actually change with the color
            theme — it only affects the accent (primary) color and focus
            rings, not backgrounds/borders/text. The sidebar&apos;s active
            item highlight does not change with the color theme (it uses a
            separate, unthemed token).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
