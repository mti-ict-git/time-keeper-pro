import { useState } from 'react';
import { useAppStore } from '@/lib/services/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Save, RotateCcw } from 'lucide-react';

const AdminRules = () => {
  const { rules, updateRules } = useAppStore();

  const [formData, setFormData] = useState({
    earlyThresholdMinutes: rules.earlyThresholdMinutes,
    onTimeThresholdMinutes: rules.onTimeThresholdMinutes,
    lateThresholdMinutes: rules.lateThresholdMinutes,
    validRequiresIn: rules.validRequiresIn,
    validRequiresOut: rules.validRequiresOut,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateRules(formData);
    toast({ title: 'Rules Updated', description: 'Attendance rules have been saved.' });
  };

  const handleReset = () => {
    setFormData({
      earlyThresholdMinutes: 30,
      onTimeThresholdMinutes: 5,
      lateThresholdMinutes: 15,
      validRequiresIn: true,
      validRequiresOut: false,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Rules</h1>
          <p className="text-muted-foreground">Configure attendance status thresholds and validation</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 max-w-2xl">
          {/* Time Thresholds */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Time Thresholds</CardTitle>
              <CardDescription>
                Define how many minutes before/after scheduled time determines status
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="early">Early (minutes)</Label>
                  <Input
                    id="early"
                    type="number"
                    min={0}
                    value={formData.earlyThresholdMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, earlyThresholdMinutes: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Clock in {formData.earlyThresholdMinutes}+ min early
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ontime">On Time (±minutes)</Label>
                  <Input
                    id="ontime"
                    type="number"
                    min={0}
                    value={formData.onTimeThresholdMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, onTimeThresholdMinutes: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Within ±{formData.onTimeThresholdMinutes} min
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="late">Late (minutes)</Label>
                  <Input
                    id="late"
                    type="number"
                    min={0}
                    value={formData.lateThresholdMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, lateThresholdMinutes: Number(e.target.value) })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Clock in {formData.lateThresholdMinutes}+ min late
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Validity Rules */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Validity Rules</CardTitle>
              <CardDescription>
                Define what constitutes a valid attendance record
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Requires Clock In</Label>
                  <p className="text-sm text-muted-foreground">
                    Record is invalid if no clock in time
                  </p>
                </div>
                <Switch
                  checked={formData.validRequiresIn}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, validRequiresIn: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Requires Clock Out</Label>
                  <p className="text-sm text-muted-foreground">
                    Record is invalid if no clock out time
                  </p>
                </div>
                <Switch
                  checked={formData.validRequiresOut}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, validRequiresOut: checked })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default AdminRules;
