package model

import "strings"

// 简化的供应商映射规则。顺序即匹配优先级，避免包含多个关键词的模型
// 因 Go map 遍历顺序不稳定而在不同刷新中得到不同供应商。
var defaultVendorRules = []struct {
	pattern    string
	vendorName string
}{
	{pattern: "gpt", vendorName: "OpenAI"},
	{pattern: "dall-e", vendorName: "OpenAI"},
	{pattern: "whisper", vendorName: "OpenAI"},
	{pattern: "o1", vendorName: "OpenAI"},
	{pattern: "o3", vendorName: "OpenAI"},
	{pattern: "claude", vendorName: "Anthropic"},
	{pattern: "gemini", vendorName: "Google"},
	{pattern: "moonshot", vendorName: "Moonshot"},
	{pattern: "kimi", vendorName: "Moonshot"},
	{pattern: "chatglm", vendorName: "智谱"},
	{pattern: "glm-", vendorName: "智谱"},
	{pattern: "qwen", vendorName: "阿里巴巴"},
	{pattern: "deepseek", vendorName: "DeepSeek"},
	{pattern: "abab", vendorName: "MiniMax"},
	{pattern: "minimax", vendorName: "MiniMax"},
	{pattern: "ernie", vendorName: "百度"},
	{pattern: "spark", vendorName: "讯飞"},
	{pattern: "hunyuan", vendorName: "腾讯"},
	{pattern: "command", vendorName: "Cohere"},
	{pattern: "@cf/", vendorName: "Cloudflare"},
	{pattern: "360", vendorName: "360"},
	{pattern: "yi", vendorName: "零一万物"},
	{pattern: "jina", vendorName: "Jina"},
	{pattern: "mistral", vendorName: "Mistral"},
	{pattern: "grok", vendorName: "xAI"},
	{pattern: "llama", vendorName: "Meta"},
	{pattern: "doubao", vendorName: "字节跳动"},
	{pattern: "kling", vendorName: "快手"},
	{pattern: "jimeng", vendorName: "即梦"},
	{pattern: "vidu", vendorName: "Vidu"},
}

// 供应商默认图标映射
var defaultVendorIcons = map[string]string{
	"OpenAI":     "OpenAI",
	"Anthropic":  "Claude.Color",
	"Google":     "Gemini.Color",
	"Moonshot":   "Moonshot",
	"智谱":         "Zhipu.Color",
	"阿里巴巴":       "Qwen.Color",
	"DeepSeek":   "DeepSeek.Color",
	"MiniMax":    "Minimax.Color",
	"百度":         "Wenxin.Color",
	"讯飞":         "Spark.Color",
	"腾讯":         "Hunyuan.Color",
	"Cohere":     "Cohere.Color",
	"Cloudflare": "Cloudflare.Color",
	"360":        "Ai360.Color",
	"零一万物":       "Yi.Color",
	"Jina":       "Jina",
	"Mistral":    "Mistral.Color",
	"xAI":        "XAI",
	"Meta":       "Ollama",
	"字节跳动":       "Doubao.Color",
	"快手":         "Kling.Color",
	"即梦":         "Jimeng.Color",
	"Vidu":       "Vidu",
	"微软":         "AzureAI",
	"Microsoft":  "AzureAI",
	"Azure":      "AzureAI",
}

// initDefaultVendorMapping 简化的默认供应商映射
func initDefaultVendorMapping(metaMap map[string]*Model, vendorMap map[int]*Vendor, enableAbilities []AbilityWithChannel) {
	for _, ability := range enableAbilities {
		modelName := ability.Model
		if _, exists := metaMap[modelName]; exists {
			continue
		}

		vendorID := 0
		if vendorName := defaultVendorName(modelName); vendorName != "" {
			vendorID = getDisplayVendor(vendorName, vendorMap)
		}

		// 创建模型元数据
		metaMap[modelName] = &Model{
			ModelName: modelName,
			VendorID:  vendorID,
			Status:    1,
			NameRule:  NameRuleExact,
		}
	}
}

func defaultVendorName(modelName string) string {
	modelLower := strings.ToLower(modelName)
	for _, rule := range defaultVendorRules {
		if strings.Contains(modelLower, rule.pattern) {
			return rule.vendorName
		}
	}
	return ""
}

// Default vendor entries are presentation data. Reading pricing must never
// recreate a deleted/merged database record.
var defaultVendorDisplayIDs = map[string]int{
	"360":        -1001,
	"Anthropic":  -1002,
	"Cloudflare": -1003,
	"Cohere":     -1004,
	"DeepSeek":   -1005,
	"Google":     -1006,
	"Jina":       -1007,
	"Meta":       -1008,
	"MiniMax":    -1009,
	"Mistral":    -1010,
	"Moonshot":   -1011,
	"OpenAI":     -1012,
	"Vidu":       -1013,
	"xAI":        -1014,
	"即梦":         -1015,
	"字节跳动":       -1016,
	"快手":         -1017,
	"智谱":         -1018,
	"百度":         -1019,
	"腾讯":         -1020,
	"讯飞":         -1021,
	"阿里巴巴":       -1022,
	"零一万物":       -1023,
}

func getDisplayVendor(vendorName string, vendorMap map[int]*Vendor) int {
	for id, vendor := range vendorMap {
		if strings.EqualFold(vendor.Name, vendorName) {
			return id
		}
	}
	id := defaultVendorDisplayIDs[vendorName]
	if id == 0 {
		return 0
	}
	vendorMap[id] = &Vendor{Id: id, Name: vendorName, Status: 1, Icon: getDefaultVendorIcon(vendorName)}
	return id
}

// 获取供应商默认图标
func getDefaultVendorIcon(vendorName string) string {
	if icon, exists := defaultVendorIcons[vendorName]; exists {
		return icon
	}
	return ""
}
