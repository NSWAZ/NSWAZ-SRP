import fs from "fs";
import path from "path";

interface SrpTier {
  name: string;
  maxPayout: number;
  classes: string[];
}

interface SrpLimitsData {
  version: string;
  description: string;
  tiers: SrpTier[];
}

class SrpLimitsService {
  private limitsData: SrpLimitsData | null = null;
  private classToMaxPayout: Map<string, number> = new Map();
  private classToTier: Map<string, string> = new Map();

  async initialize(): Promise<void> {
    const limitsPath = path.join(process.cwd(), "server/staticData/srpLimits.json");

    if (!fs.existsSync(limitsPath)) {
      console.warn("SRP limits file not found at:", limitsPath);
      return;
    }

    const data = fs.readFileSync(limitsPath, "utf-8");
    this.limitsData = JSON.parse(data) as SrpLimitsData;

    this.classToMaxPayout.clear();
    this.classToTier.clear();

    for (const tier of this.limitsData.tiers) {
      for (const className of tier.classes) {
        this.classToMaxPayout.set(className, tier.maxPayout);
        this.classToTier.set(className, tier.name);
      }
    }

    console.log(`SRP limits loaded: ${this.classToMaxPayout.size} ship classes, version ${this.limitsData.version}`);
  }

  getSoloMaxPayout(groupName: string): number | null {
    return this.classToMaxPayout.get(groupName) ?? null;
  }

  getTierName(groupName: string): string | null {
    return this.classToTier.get(groupName) ?? null;
  }

  getAllTiers(): SrpTier[] {
    return this.limitsData?.tiers || [];
  }

  isLoaded(): boolean {
    return this.limitsData !== null;
  }

  getVersion(): string | null {
    return this.limitsData?.version || null;
  }
}

export const srpLimitsService = new SrpLimitsService();
