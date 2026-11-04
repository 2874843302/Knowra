import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Settings } from "lucide-react";
import { useStore } from "../store";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";

export function ModelSelector({
  value,
  onValueChange,
  disabled = false,
  className = "",
}) {
  const { provider, selectProvider, notify } = useStore();
  const [switching, setSwitching] = useState(false);
  const profiles = provider.profiles || [];
  const selected =
    profiles.find((p) => p.id === (value || provider.activeId)) || provider;
  if (!profiles.length)
    return (
      <Link to="/settings#ai" className={`model-picker ${className}`}>
        {provider.configured ? provider.model : "连接 AI 模型"}
        <ChevronDown size={13} />
      </Link>
    );
  const choose = async (id) => {
    if (id === selected.id) return;
    setSwitching(true);
    try {
      if (onValueChange) await onValueChange(id);
      else await selectProvider(id);
    } catch (error) {
      notify(error.message);
    } finally {
      setSwitching(false);
    }
  };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`model-picker ${className}`}
          disabled={disabled || switching || provider.loading}
          aria-label={`切换模型，当前：${selected.name || selected.model}`}
          aria-busy={switching}
        >
          <span className="model-picker-name">
            {selected.name || selected.model}
          </span>
          <ChevronDown size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="model-picker-menu">
        {profiles.map((profile) => (
          <DropdownMenuItem
            key={profile.id}
            disabled={!profile.configured}
            onSelect={() => choose(profile.id)}
          >
            <span className="model-picker-option">
              <strong>{profile.name || profile.model}</strong>
              <small>{profile.model}</small>
            </span>
            {selected.id === profile.id && (
              <Check size={15} aria-label="当前模型" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings#ai">
            <Settings size={15} />
            管理模型
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
