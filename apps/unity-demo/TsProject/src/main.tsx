import React, { useState, useCallback } from 'react';
import {
  render,
  useController,
  WindowManagerProvider, useWindowManager, GameWindow,
  HpBar, SkillBar, BuffIcon, ChatPanel, BagGrid, TabBar, GameTooltip,
  type SkillSlot, type ChatMessage, type ChatChannel, type BagGridItem,
} from '@tower-ui/core';
import { UnityAdapter } from '@tower-ui/unity-adapter';

declare const CS: any;
const Debug = CS.UnityEngine.Debug;
const GameObject = CS.UnityEngine.GameObject;
const Screen = CS.UnityEngine.Screen;
const TowerUIBoot = CS.TowerUI.TowerUIBoot;

// ── Mock Data ─────────────────────────────────────────────

const SKILLS: SkillSlot[] = [
  { id: 's1', icon: 'Q', hotkey: 'Q' },
  { id: 's2', icon: 'W', hotkey: 'W', cooldown: 3, maxCooldown: 8 },
  { id: 's3', icon: 'E', hotkey: 'E' },
  { id: 's4', icon: 'R', hotkey: 'R', cooldown: 12, maxCooldown: 60 },
  { id: 's5', icon: 'D', hotkey: 'D' },
  { id: 's6', icon: 'F', hotkey: 'F', disabled: true },
];

const CHANNELS: ChatChannel[] = [
  { id: 'all', name: 'All', color: '#ffffff' },
  { id: 'world', name: 'World', color: '#ffcc00' },
  { id: 'guild', name: 'Guild', color: '#44cc44' },
  { id: 'party', name: 'Party', color: '#4488ff' },
];

const INIT_MESSAGES: ChatMessage[] = [
  { id: 'm1', channel: 'world', sender: 'Player1', text: 'LFG Dragon Raid!' },
  { id: 'm2', channel: 'guild', sender: 'GuildMaster', text: 'Guild war at 8pm' },
  { id: 'm3', channel: 'world', sender: 'Merchant', text: 'WTS Epic Sword 500g' },
  { id: 'm4', channel: 'party', sender: 'Healer', text: 'Ready when you are' },
  { id: 'm5', channel: 'world', sender: 'Newbie', text: 'How do I open inventory?' },
];

const BAG_ITEMS: (BagGridItem | null)[] = [
  { id: 'i1', icon: 'Sw', count: 1, rarity: 'epic', name: 'Dragon Sword' },
  { id: 'i2', icon: 'He', count: 1, rarity: 'rare', name: 'Steel Helm' },
  { id: 'i3', icon: 'HP', count: 15, rarity: 'common', name: 'HP Potion' },
  { id: 'i4', icon: 'MP', count: 8, rarity: 'common', name: 'MP Potion' },
  { id: 'i5', icon: 'Cr', count: 3, rarity: 'rare', name: 'Crystal' },
  { id: 'i6', icon: 'DS', count: 1, rarity: 'legendary', name: 'Dragon Scale' },
  null, null, null, null, null, null,
  null, null, null, null, null, null,
  null, null, null, null, null, null,
];

// ── HUD ───────────────────────────────────────────────────

function PlayerStatus() {
  return React.createElement('ui-view', {
    position: 'absolute', top: 20, left: 20,
    flexDirection: 'column', gap: 6, width: 280, height: 80,
  },
    React.createElement('ui-text', {
      text: 'Lv.45 DragonSlayer', fontSize: 16, color: '#e0e1dd',
      width: 280, height: 20, bold: true,
    }),
    React.createElement(HpBar, {
      current: 3500, max: 5000, width: 260, height: 22,
      barColor: '#44cc44', label: 'HP 3500/5000',
    }),
    React.createElement(HpBar, {
      current: 1200, max: 2000, width: 260, height: 18,
      barColor: '#4488ff', label: 'MP 1200/2000',
    }),
  );
}

function BuffBar() {
  return React.createElement('ui-view', {
    position: 'absolute', top: 20, left: 320,
    flexDirection: 'row', gap: 4, width: 250, height: 44,
  },
    React.createElement(BuffIcon, { icon: 'At', remaining: 25, size: 40 }),
    React.createElement(BuffIcon, { icon: 'Df', remaining: 180, stacks: 3, size: 40 }),
    React.createElement(BuffIcon, { icon: 'Ps', debuff: true, remaining: 8, size: 40 }),
    React.createElement(BuffIcon, { icon: 'Sp', remaining: 60, size: 40 }),
  );
}

function BottomSkillBar() {
  return React.createElement('ui-view', {
    position: 'absolute', bottom: 20,
    left: 480,
    width: 500, height: 70,
    alignItems: 'center', justifyContent: 'center',
  },
    React.createElement(SkillBar, {
      skills: SKILLS, slotSize: 64, gap: 8,
      onUseSkill: (id: string) => Debug.Log(`[Skill] Use: ${id}`),
    }),
  );
}

// ── Inventory Window ──────────────────────────────────────

function InventoryContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const controller = useController('bagTab', ['All', 'Equip', 'Misc']);
  const selectedItem = BAG_ITEMS.find(i => i?.id === selectedId);

  return React.createElement('ui-view', {
    flexDirection: 'column', gap: 8, padding: 12, width: 500, height: 400,
  },
    React.createElement(TabBar, { controller, width: 476, height: 36, fontSize: 14 }),
    React.createElement(BagGrid, {
      items: BAG_ITEMS, cols: 6, rows: 4,
      slotSize: 72, gap: 4, selectedId: selectedId ?? undefined,
      onSelect: (item: BagGridItem) => { setSelectedId(item.id); Debug.Log('[Bag] ' + item.name); },
    }),
    React.createElement(GameTooltip, {
      visible: !!selectedItem,
      x: 320, y: 100,
      title: selectedItem?.name ?? '',
      rarity: selectedItem?.rarity,
      stats: selectedItem ? [
        { label: 'Count', value: `x${selectedItem.count}` },
      ] : undefined,
      description: selectedItem ? `A fine ${selectedItem.rarity} item.` : undefined,
    }),
  );
}

// ── Main HUD ──────────────────────────────────────────────

function GameHUD() {
  const wm = useWindowManager();
  const [messages, setMessages] = useState<ChatMessage[]>(INIT_MESSAGES);
  let msgCounter = INIT_MESSAGES.length;

  const handleSend = useCallback((channel: string, text: string) => {
    msgCounter++;
    setMessages(prev => [...prev, {
      id: `m${Date.now()}`, channel, sender: 'You', text,
    }]);
    Debug.Log(`[Chat] [${channel}] ${text}`);
  }, []);

  return React.createElement('ui-view', {
    width: 1920, height: 1080,
    tint: '#0a0e1aff',
  },
    // Player status (top-left)
    React.createElement(PlayerStatus, null),
    // Buffs
    React.createElement(BuffBar, null),
    // Bag button (top-right)
    React.createElement('ui-view', {
      position: 'absolute', top: 20, right: 20,
      width: 100, height: 40, tint: '#334466',
      alignItems: 'center', justifyContent: 'center',
      onClick: () => {
        if (!wm.isOpen('bag')) {
          wm.open({ id: 'bag', title: 'Inventory', width: 500, height: 440 });
          Debug.Log('[HUD] Open Inventory');
        } else {
          wm.close('bag');
        }
      },
    },
      React.createElement('ui-text', {
        text: 'BAG [B]', fontSize: 14, color: '#4cc9f0',
        width: 100, height: 40, align: 'center', bold: true,
      })
    ),
    // Skill bar (bottom-center)
    React.createElement(BottomSkillBar, null),
    // Chat panel (bottom-left)
    React.createElement('ui-view', {
      position: 'absolute', bottom: 20, left: 20,
      width: 420, height: 260,
    },
      React.createElement(ChatPanel, {
        channels: CHANNELS,
        messages,
        width: 420, height: 260,
        onSend: handleSend,
      })
    ),
    // Windows
    React.createElement(GameWindow, {
      id: 'bag', title: 'Inventory',
      width: 500, height: 440,
      x: 700, y: 200,
      closable: true, draggable: true,
    },
      React.createElement(InventoryContent, null),
    ),
  );
}

// ── App ───────────────────────────────────────────────────

function App() {
  return React.createElement(WindowManagerProvider, null,
    React.createElement(GameHUD, null),
  );
}

function runAutoTests() {
  Debug.Log('[TowerUI] ======== Running Automated Tests ========');

  try {
    const { runPhase5Tests } = require('./tests/phase5.test');
    runPhase5Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 5 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase6Tests } = require('./tests/phase6.test');
    runPhase6Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 6 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase7Tests } = require('./tests/phase7.test');
    runPhase7Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 7 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase9Tests } = require('./tests/phase9.test');
    runPhase9Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 9 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase10Tests } = require('./tests/phase10.test');
    runPhase10Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 10 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase11Tests } = require('./tests/phase11.test');
    runPhase11Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 11 tests failed to load: ' + e.message);
  }

  try {
    const { runPhase12Tests } = require('./tests/phase12.test');
    runPhase12Tests();
  } catch (e: any) {
    Debug.LogError('[Test] Phase 12 tests failed to load: ' + e.message);
  }

  Debug.Log('[TowerUI] ======== Tests Complete ========');
}

function main() {
  runAutoTests();

  // Start LF Game (lfclient → TowerGUI migration demo)
  const { startLFGame } = require('./lfgame/index');
  startLFGame();
}

main();
