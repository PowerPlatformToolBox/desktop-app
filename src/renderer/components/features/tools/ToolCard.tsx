import { Button, Card, CardFooter, CardHeader, Label, makeStyles } from "@fluentui/react-components";
import { DeleteRegular, PlayFilled, WrenchScrewdriver20Color } from "@fluentui/react-icons";
import React from "react";

interface Tool {
    id: string;
    name: string;
    description: string;
    author?: string;
    version?: string;
    icon?: string;
    category?: string;
}

interface ToolCardProps {
    tool: Tool;
    onLaunch: (toolId: string) => void;
    onUninstall?: (toolId: string) => void;
}

const useStyles = makeStyles({
    gradientButton: {
        background: "linear-gradient(to right, #0078D4, #8A3FFC)",
        color: "#fff",
        // Define hover state styles
        "&:hover": {
            background: "linear-gradient(to right, #106ebe, #7a35e0)", // Subtle gradient change on hover
            color: "#fff",
        },
        "&:active": {
            background: "linear-gradient(to right, #106ebe, #7a35e0)",
            color: "#fff",
        },
    },
    headerImage: {
        borderRadius: "4px",
        maxWidth: "44px",
        maxHeight: "44px",
    },
    text: { margin: "0" },
    footerLayout: {
        display: "flex",
        justifyContent: "space-between", // Pushes items to opposite ends
        width: "100%", // Ensure the footer takes the full width of the card
        // You may also add a gap between buttons if needed, though not strictly necessary with space-between
        // gap: '8px',
    },
});

export const ToolCard: React.FC<ToolCardProps> = ({ tool, onLaunch, onUninstall }) => {
    const styles = useStyles();

    const handleLaunch = (e: React.MouseEvent) => {
        e.stopPropagation();
        onLaunch(tool.id);
    };

    const handleUninstall = () => {
        if (onUninstall) {
            onUninstall(tool.id);
        }
    };

    return (
        <>
            <Card onClick={handleLaunch}>
                <CardHeader
                    image={tool.icon ? <img className={styles.headerImage} src={tool.icon} alt={`${tool.name} icon`} /> : <WrenchScrewdriver20Color />}
                    header={
                        <Label weight="semibold" size="medium">
                            {tool.name}
                        </Label>
                    }
                    description={<Label size="small">by {tool.author}</Label>}
                />
                <p className={styles.text}>{tool.description}</p>
                <CardFooter className={styles.footerLayout}>
                    <Button className={styles.gradientButton} appearance="primary" icon={<PlayFilled />} onClick={handleLaunch}>
                        Launch
                    </Button>
                    <Button appearance="transparent" icon={<DeleteRegular color="red" />} onClick={handleUninstall} />
                </CardFooter>
            </Card>
        </>
    );
};
