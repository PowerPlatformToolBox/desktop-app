import { Button, Card, CardFooter, CardHeader, Label, makeStyles } from "@fluentui/react-components";
import { DeleteRegular, PlayFilled, WrenchScrewdriver20Color } from "@fluentui/react-icons";
import React from "react";
import "./ToolCard.scss";

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
    main: {
        gap: "36px",
        display: "flex",
        flexDirection: "column",
        flexWrap: "wrap",
    },
    card: {
        width: "360px",
        maxWidth: "100%",
        height: "fit-content",
    },
    section: {
        width: "fit-content",
    },
    title: { margin: "0 0 12px" },
    horizontalCardImage: {
        width: "64px",
        height: "64px",
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
                    <Button appearance="primary" icon={<PlayFilled />} onClick={handleLaunch}>
                        Launch
                    </Button>
                    <Button appearance="transparent" icon={<DeleteRegular color="red" />} onClick={handleUninstall} />
                </CardFooter>
            </Card>
            {/* <div className="tool-card-pptb" onClick={handleLaunch}>
            <div className="tool-card-icon">{tool.icon ? <img src={tool.icon} alt={`${tool.name} icon`} /> : <WrenchScrewdriverColor />}</div>

            <div className="tool-card-details">
                <div className="tool-card-header">
                    <h4 className="tool-card-name">{tool.name}</h4>
                    <div className="tool-card-actions">
                        <Button icon={<Play20Regular />} size="small" appearance="subtle" onClick={handleLaunch} title="Launch tool" />
                        {onUninstall && (
                            <Menu>
                                <MenuTrigger disableButtonEnhancement>
                                    <Button icon={<MoreHorizontal20Regular />} size="small" appearance="subtle" onClick={(e) => e.stopPropagation()} />
                                </MenuTrigger>
                                <MenuPopover>
                                    <MenuList>
                                        <MenuItem onClick={handleUninstall}>Uninstall</MenuItem>
                                    </MenuList>
                                </MenuPopover>
                            </Menu>
                        )}
                    </div>
                </div>
                <p className="tool-card-description">{tool.description}</p>
                {tool.author && <p className="tool-card-author">by {tool.author}</p>}
                {tool.version && <span className="tool-card-version">v{tool.version}</span>}
            </div>
        </div> */}
        </>
    );
};
