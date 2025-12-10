<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '$lib/services/api';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';

  export type MarketplaceItem = {
    id: string;
    name: string;
    description?: string;
    manufacturer?: string;
    ifc_type: string;
    fragment_url: string;
    thumbnail_url?: string;
    physics: {
      thermal_conductivity?: number;
      specific_heat?: number;
      density?: number;
      thickness?: number;
      u_value?: number;
    };
    properties?: Record<string, any>;
  };

  let { onItemDrag } = $props<{
    onItemDrag?: (event: { item: MarketplaceItem }) => void;
  }>();

  let items = $state<MarketplaceItem[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state('');
  let selectedType = $state<string>('all');

  onMount(async () => {
    await loadItems();
  });

  async function loadItems() {
    isLoading = true;
    error = null;
    try {
      items = await get('marketplace/items');
    } catch (err: any) {
      console.error('Error loading marketplace items:', err);
      error = `Fehler beim Laden der Marketplace-Items: ${err.message}`;
      // Fallback to placeholder data
      items = getPlaceholderItems();
    } finally {
      isLoading = false;
    }
  }

  function getPlaceholderItems(): MarketplaceItem[] {
    return [
      {
        id: '1',
        name: 'Standard Window 120x200',
        description: 'Double-glazed window with thermal break',
        manufacturer: 'Example Corp',
        ifc_type: 'IfcWindow',
        fragment_url: '/fragments/window_120x200.frag',
        physics: {
          thermal_conductivity: 0.8,
          specific_heat: 1000,
          density: 2500,
          thickness: 0.04,
          u_value: 1.2
        },
        properties: {
          width: 1.2,
          height: 2.0,
          depth: 0.04
        }
      },
      {
        id: '2',
        name: 'Concrete Wall 200mm',
        description: 'Standard reinforced concrete wall',
        manufacturer: 'Example Corp',
        ifc_type: 'IfcWallStandardCase',
        fragment_url: '/fragments/wall_concrete_200.frag',
        physics: {
          thermal_conductivity: 1.4,
          specific_heat: 880,
          density: 2400,
          thickness: 0.2,
          u_value: 1.8
        },
        properties: {
          width: 1.0,
          height: 3.0,
          depth: 0.2
        }
      },
      {
        id: '3',
        name: 'Steel Door 90x210',
        description: 'Fire-rated steel door',
        manufacturer: 'Example Corp',
        ifc_type: 'IfcDoor',
        fragment_url: '/fragments/door_steel_90x210.frag',
        physics: {
          thermal_conductivity: 50.0,
          specific_heat: 500,
          density: 7850,
          thickness: 0.05,
          u_value: 2.5
        },
        properties: {
          width: 0.9,
          height: 2.1,
          depth: 0.05
        }
      }
    ];
  }

  function handleDragStart(e: DragEvent, item: MarketplaceItem) {
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('application/json', JSON.stringify(item));
      onItemDrag?.({ item });
    }
  }

  const filteredItems = $derived.by(() => {
    let filtered = items;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.name.toLowerCase().includes(query) ||
          item.description?.toLowerCase().includes(query) ||
          item.manufacturer?.toLowerCase().includes(query)
      );
    }
    
    if (selectedType !== 'all') {
      filtered = filtered.filter(item => item.ifc_type === selectedType);
    }
    
    return filtered;
  });

  const uniqueTypes = $derived.by(() => {
    if (items.length === 0) return [];
    const types = new Set(items.map(item => item.ifc_type));
    return Array.from(types).sort();
  });
</script>

<Card class="w-full h-full flex flex-col">
  <CardHeader class="p-3 border-b">
    <CardTitle class="text-xs font-bold uppercase tracking-widest text-muted-foreground">
      Marketplace
    </CardTitle>
  </CardHeader>
  
  <CardContent class="flex-1 flex flex-col overflow-hidden p-2">
    <!-- Search and Filter -->
    <div class="space-y-2 mb-3">
      <div>
        <Label for="search" class="sr-only">Suche</Label>
        <Input
          id="search"
          type="text"
          placeholder="Suche..."
          bind:value={searchQuery}
          class="h-8 text-xs"
        />
      </div>
      <div>
        <Label for="type-filter" class="sr-only">IFC Typ</Label>
        <select
          id="type-filter"
          bind:value={selectedType}
          class="w-full h-8 text-xs px-2 rounded-md border border-input bg-background"
        >
          <option value="all">Alle Typen</option>
          {#each uniqueTypes as type (type)}
            <option value={type}>{type}</option>
          {/each}
        </select>
      </div>
    </div>

    <!-- Items List -->
    <div class="flex-1 overflow-y-auto space-y-2">
      {#if isLoading}
        <div class="p-4 text-center text-sm text-muted-foreground">Lade Items...</div>
      {:else if error}
        <Alert variant="destructive" class="p-2">
          <AlertDescription class="text-xs">{error}</AlertDescription>
        </Alert>
      {:else if filteredItems.length === 0}
        <div class="p-4 text-center text-sm text-muted-foreground">
          {searchQuery || selectedType !== 'all' ? 'Keine Items gefunden.' : 'Keine Items verfügbar.'}
        </div>
      {:else}
        {#each filteredItems as item (item.id)}
          <div
            draggable="true"
            role="button"
            tabindex="0"
            ondragstart={(e) => handleDragStart(e, item)}
            class="p-2 rounded-md border border-border bg-card hover:bg-muted cursor-move transition-colors"
          >
            <div class="font-semibold text-sm mb-1">{item.name}</div>
            {#if item.description}
              <div class="text-xs text-muted-foreground mb-1 line-clamp-2">
                {item.description}
              </div>
            {/if}
            <div class="flex items-center justify-between mt-2">
              <span class="text-xs text-muted-foreground">{item.ifc_type}</span>
              {#if item.physics.u_value}
                <span class="text-xs font-mono bg-muted px-1 rounded">
                  U: {item.physics.u_value} W/m²K
                </span>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </CardContent>
</Card>

